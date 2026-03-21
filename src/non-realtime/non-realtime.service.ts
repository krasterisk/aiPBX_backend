import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NonRealtimeSession } from './non-realtime.session';
import { IVadProvider, VadConfig } from './interfaces/vad-provider.interface';
import { ISttProvider } from './interfaces/stt-provider.interface';
import { ILlmProvider, LlmDelta, LlmTool, LlmToolCall } from './interfaces/llm-provider.interface';
import { ITtsProvider } from './interfaces/tts-provider.interface';
import { Assistant } from '../assistants/assistants.model';
import { AudioService } from '../audio/audio.service';
import { StreamAudioService } from '../audio/streamAudio.service';
import { AiCdrService } from '../ai-cdr/ai-cdr.service';
import { BillingService } from '../billing/billing.service';
import { ToolGatewayService } from '../mcp-client/services/tool-gateway.service';
import { McpToolRegistryService } from '../mcp-client/services/mcp-tool-registry.service';
import { WsServerGateway } from '../ws-server/ws-server.gateway';

/**
 * Non-Realtime Voice Pipeline Orchestrator.
 *
 * Manages the full pipeline: VAD → STT → LLM → TTS
 * for each active call session.
 *
 * Audio flow:
 *   Asterisk (alaw 8kHz) → RtpUdpServer → processAudio() → VAD
 *     → speech_start: interrupt current TTS
 *     → speech_end: STT → LLM (streaming) → TTS (sentence-level) → StreamAudio → Asterisk
 */
@Injectable()
export class NonRealtimeService {
    private readonly logger = new Logger(NonRealtimeService.name);
    private sessions = new Map<string, NonRealtimeSession>();

    // Provider instances (injected or resolved at runtime)
    private vadProvider: IVadProvider;
    private sttProviders = new Map<string, ISttProvider>();
    private llmProviders = new Map<string, ILlmProvider>();
    private ttsProviders = new Map<string, ITtsProvider>();

    constructor(
        private readonly eventEmitter: EventEmitter2,
        private readonly audioService: AudioService,
        private readonly streamAudioService: StreamAudioService,
        private readonly aiCdrService: AiCdrService,
        private readonly billingService: BillingService,
        private readonly toolGateway: ToolGatewayService,
        private readonly mcpToolRegistry: McpToolRegistryService,
        private readonly wsGateway: WsServerGateway,
    ) {}

    // ── Provider Registration ────────────────────────────────

    registerVadProvider(provider: IVadProvider): void {
        this.vadProvider = provider;
        this.logger.log(`VAD provider registered: ${provider.name}`);
    }

    registerSttProvider(name: string, provider: ISttProvider): void {
        this.sttProviders.set(name, provider);
        this.logger.log(`STT provider registered: ${name}`);
    }

    registerLlmProvider(name: string, provider: ILlmProvider): void {
        this.llmProviders.set(name, provider);
        this.logger.log(`LLM provider registered: ${name}`);
    }

    registerTtsProvider(name: string, provider: ITtsProvider): void {
        this.ttsProviders.set(name, provider);
        this.logger.log(`TTS provider registered: ${name}`);
    }

    // ── Session Management ───────────────────────────────────

    async createSession(
        channelId: string,
        callerId: string,
        assistant: Assistant,
        address: string,
        port: string,
    ): Promise<NonRealtimeSession> {
        if (this.sessions.has(channelId)) {
            this.logger.warn(`Session already exists for ${channelId}`);
            return this.sessions.get(channelId);
        }

        const session = new NonRealtimeSession(channelId, callerId, assistant);
        session.address = address;
        session.port = port;
        this.sessions.set(channelId, session);

        // Create CDR
        const source = channelId.startsWith('playground-') ? 'playground' : 'call';
        await this.aiCdrService.cdrCreate({
            channelId,
            callerId,
            assistantId: assistant.id,
            assistantName: assistant.name,
            userId: assistant.userId,
            vPbxUserId: assistant.user?.vpbx_user_id,
            source,
        });

        // Send greeting if configured
        if (assistant.greeting) {
            await this.synthesizeAndPlay(session, assistant.greeting);
        }

        this.logger.log(`[${channelId}] Non-realtime session created (STT: ${assistant['sttProvider'] || 'whisper-local'}, LLM: ${assistant['llmProvider'] || 'openai'}, TTS: ${assistant['ttsProvider'] || 'silero'})`);
        return session;
    }

    getSession(channelId: string): NonRealtimeSession | undefined {
        return this.sessions.get(channelId);
    }

    async closeSession(channelId: string): Promise<void> {
        const session = this.sessions.get(channelId);
        if (!session) return;

        session.destroy();
        this.sessions.delete(channelId);

        await this.aiCdrService.cdrHangup(channelId, session.assistant.id);
        this.logger.log(`[${channelId}] Non-realtime session closed`);
    }

    // ── Audio Processing (called from RtpUdpServer) ─────────

    /**
     * Silero VAD requires 1536-sample frames (96ms @ 16kHz = 3072 bytes).
     * RTP packets are only ~320 samples (~640 bytes), so we must accumulate.
     */
    private static readonly VAD_FRAME_SAMPLES = 1536;
    private static readonly VAD_FRAME_BYTES = NonRealtimeService.VAD_FRAME_SAMPLES * 2; // 16-bit PCM
    private static readonly VAD_FRAME_DURATION_MS = (NonRealtimeService.VAD_FRAME_SAMPLES / 16000) * 1000; // ~96ms

    /**
     * Process incoming audio frame from Asterisk.
     * This is called for every RTP packet (~20ms, alaw 8kHz).
     * Audio is already converted to PCM16 16kHz by caller.
     *
     * @param pcm16_16k PCM16 16kHz mono audio frame
     * @param channelId Asterisk channel ID
     */
    async processAudio(pcm16_16k: Buffer, channelId: string): Promise<void> {
        const session = this.sessions.get(channelId);
        if (!session) {
            // Log once per channel to avoid spam
            if (!this['_warnedNoSession']?.has(channelId)) {
                this.logger.warn(`[${channelId}] processAudio: session not found (sessions: ${[...this.sessions.keys()].join(', ')})`);
                if (!this['_warnedNoSession']) this['_warnedNoSession'] = new Set();
                this['_warnedNoSession'].add(channelId);
            }
            return;
        }
        if (!this.vadProvider) {
            if (!this['_warnedNoVad']) {
                this.logger.warn(`[${channelId}] processAudio: VAD provider not registered! Audio will be ignored.`);
                this['_warnedNoVad'] = true;
            }
            return;
        }

        // Log first audio frame and then every 500th (≈10s) to confirm audio is flowing
        if (!session['_audioFrameCount']) session['_audioFrameCount'] = 0;
        session['_audioFrameCount']++;
        if (session['_audioFrameCount'] === 1) {
            this.logger.log(`[${channelId}] processAudio: first audio frame received (${pcm16_16k.length} bytes)`);
        } else if (session['_audioFrameCount'] % 500 === 0) {
            this.logger.debug(`[${channelId}] processAudio: ${session['_audioFrameCount']} frames processed`);
        }

        session.lastActivityAt = Date.now();

        // ── Accumulate small RTP frames into VAD-sized chunks ──
        // Silero needs 1536 samples per frame; RTP gives us ~320.
        if (!session['_vadAccumulator']) session['_vadAccumulator'] = Buffer.alloc(0);
        session['_vadAccumulator'] = Buffer.concat([session['_vadAccumulator'], pcm16_16k]);

        // Process all complete VAD frames in the accumulator
        while (session['_vadAccumulator'].length >= NonRealtimeService.VAD_FRAME_BYTES) {
            const vadChunk = session['_vadAccumulator'].subarray(0, NonRealtimeService.VAD_FRAME_BYTES);
            session['_vadAccumulator'] = session['_vadAccumulator'].subarray(NonRealtimeService.VAD_FRAME_BYTES);

            await this.processVadFrame(session, vadChunk);
        }
    }

    /**
     * Process a single VAD-sized audio frame (1536 samples / 3072 bytes).
     */
    private async processVadFrame(session: NonRealtimeSession, vadChunk: Buffer): Promise<void> {
        const { channelId } = session;

        const vadResult = await this.vadProvider.processSamples(vadChunk);
        const silenceDurationMs = Number(session.assistant.turn_detection_silence_duration_ms) || 500;

        if (vadResult.isSpeech) {
            if (session.vadState === 'idle') {
                // ── SPEECH START ──
                this.logger.log(`[${channelId}] Speech started (p=${vadResult.probability.toFixed(2)})`);
                session.startSpeech();

                // Interrupt current TTS/LLM if bot is speaking
                if (session.isSpeaking) {
                    this.logger.log(`[${channelId}] Interrupting bot speech`);
                    session.abortPipeline();
                    await this.streamAudioService.interruptStream(channelId);
                }

                // Emit event for logging/UI
                this.emitEvent(session, { type: 'input_audio_buffer.speech_started' });
            }

            session.speechBuffer.push(vadChunk);
            session.silenceMs = 0;

        } else {
            // Silence
            if (session.vadState === 'speaking') {
                session.speechBuffer.push(vadChunk); // include trailing silence
                session.silenceMs += NonRealtimeService.VAD_FRAME_DURATION_MS;

                if (session.silenceMs >= silenceDurationMs) {
                    // ── SPEECH END ──
                    this.logger.log(`[${channelId}] Speech ended (silence: ${session.silenceMs}ms)`);
                    const audioBuffer = session.collectSpeechBuffer();

                    this.emitEvent(session, { type: 'input_audio_buffer.speech_stopped' });

                    // Run pipeline asynchronously (don't block audio processing)
                    this.runPipeline(session, audioBuffer).catch(err => {
                        this.logger.error(`[${channelId}] Pipeline error:`, err.message);
                    });
                }
            } else {
                // In idle state, keep prefix buffer
                session.addToPrefixBuffer(vadChunk);
            }
        }
    }

    // ── Pipeline: STT → LLM → TTS ──────────────────────────

    /**
     * Full pipeline: Transcribe → Generate → Synthesize.
     * Runs asynchronously, can be aborted via session.pipelineAbort.
     */
    private async runPipeline(session: NonRealtimeSession, audioBuffer: Buffer): Promise<void> {
        const { channelId, assistant } = session;
        const abortController = session.newPipeline();
        const signal = abortController.signal;

        try {
            // ── Step 1: STT ──
            const sttProviderName = assistant['sttProvider'] || 'whisper-local';
            const sttProvider = this.sttProviders.get(sttProviderName);
            if (!sttProvider) {
                this.logger.error(`[${channelId}] STT provider not found: ${sttProviderName}`);
                return;
            }

            const language = assistant.input_audio_transcription_language || undefined;
            const sttResult = await sttProvider.transcribe(audioBuffer, language);

            if (signal.aborted) return;

            if (!sttResult.text || sttResult.text.trim().length === 0) {
                this.logger.debug(`[${channelId}] Empty transcription, skipping`);
                return;
            }

            this.logger.log(`[${channelId}] STT: "${sttResult.text}"`);
            session.addUserMessage(sttResult.text);

            // Log user transcription
            this.emitEvent(session, {
                type: 'conversation.item.created',
                item: { role: 'user', content: sttResult.text },
            });

            // ── Step 2: LLM (streaming) ──
            const llmProviderName = assistant['llmProvider'] || 'openai';
            const llmProvider = this.llmProviders.get(llmProviderName);
            if (!llmProvider) {
                this.logger.error(`[${channelId}] LLM provider not found: ${llmProviderName}`);
                return;
            }

            const tools = await this.buildTools(assistant);
            const llmOptions = {
                model: assistant['llmModel'] || assistant.model || 'gpt-4o-mini',
                temperature: Number(assistant.temperature) || 0.8,
                maxTokens: parseInt(assistant.max_response_output_tokens) || undefined,
                toolChoice: assistant.tool_choice || 'auto',
            };

            let fullResponse = '';
            let sentenceBuffer = '';
            let pendingToolCalls: LlmToolCall[] = [];

            const stream = llmProvider.chatStream(
                session.messages,
                tools,
                llmOptions,
                signal,
            );

            for await (const delta of stream) {
                if (signal.aborted) return;

                // Accumulate tool calls
                if (delta.toolCalls?.length) {
                    pendingToolCalls = delta.toolCalls;
                }

                // Accumulate text for sentence-level TTS
                if (delta.text) {
                    fullResponse += delta.text;
                    sentenceBuffer += delta.text;

                    // Check for sentence boundaries
                    const sentenceEnd = this.findSentenceEnd(sentenceBuffer);
                    if (sentenceEnd > 0) {
                        const sentence = sentenceBuffer.substring(0, sentenceEnd).trim();
                        sentenceBuffer = sentenceBuffer.substring(sentenceEnd);

                        if (sentence.length > 0) {
                            // Start TTS for this sentence immediately (don't await)
                            this.synthesizeAndPlay(session, sentence).catch(err => {
                                if (!signal.aborted) {
                                    this.logger.error(`[${channelId}] TTS error:`, err.message);
                                }
                            });
                        }
                    }
                }

                // Track token usage
                if (delta.usage) {
                    session.totalTokens.prompt += delta.usage.promptTokens;
                    session.totalTokens.completion += delta.usage.completionTokens;
                }
            }

            if (signal.aborted) return;

            // Flush remaining sentence buffer
            if (sentenceBuffer.trim().length > 0) {
                await this.synthesizeAndPlay(session, sentenceBuffer.trim());
            }

            // ── Handle Tool Calls ──
            if (pendingToolCalls.length > 0) {
                session.addAssistantMessage(fullResponse, pendingToolCalls);
                await this.handleToolCalls(session, pendingToolCalls, tools, llmOptions);
                return;
            }

            // Save assistant response
            if (fullResponse) {
                session.addAssistantMessage(fullResponse);
                this.emitEvent(session, {
                    type: 'response.done',
                    response: { output: [{ type: 'message', content: fullResponse }] },
                });
            }

        } catch (err) {
            if (signal.aborted) return; // interrupt, not an error
            this.logger.error(`[${channelId}] Pipeline error:`, err.message || err);
        }
    }

    // ── Tool Calling ────────────────────────────────────────

    private async handleToolCalls(
        session: NonRealtimeSession,
        toolCalls: LlmToolCall[],
        tools: LlmTool[],
        llmOptions: any,
    ): Promise<void> {
        const { channelId, assistant } = session;
        const signal = session.pipelineAbort?.signal;

        for (const tc of toolCalls) {
            if (signal?.aborted) return;

            this.logger.log(`[${channelId}] Tool call: ${tc.function.name}`);

            const item = {
                name: tc.function.name,
                call_id: tc.id,
                arguments: tc.function.arguments,
            };

            try {
                const { output: toolOutput, sendResponse } = await this.toolGateway.execute(
                    item,
                    session as any,
                    assistant,
                );

                if (toolOutput) {
                    session.addToolResult(tc.id, tc.function.name, toolOutput);

                    this.emitEvent(session, {
                        type: 'function_call.completed',
                        name: tc.function.name,
                        output: toolOutput,
                    });
                }
            } catch (error) {
                this.logger.error(`[${channelId}] Tool ${tc.function.name} error:`, error.message);
                session.addToolResult(tc.id, tc.function.name, `Error: ${error.message}`);
            }
        }

        if (signal?.aborted) return;

        // Re-run LLM with tool results (recursive pipeline)
        const llmProviderName = assistant['llmProvider'] || 'openai';
        const llmProvider = this.llmProviders.get(llmProviderName);
        if (!llmProvider) return;

        let fullResponse = '';
        let sentenceBuffer = '';
        let newToolCalls: LlmToolCall[] = [];

        const stream = llmProvider.chatStream(
            session.messages,
            tools,
            llmOptions,
            signal,
        );

        for await (const delta of stream) {
            if (signal?.aborted) return;

            if (delta.toolCalls?.length) {
                newToolCalls = delta.toolCalls;
            }

            if (delta.text) {
                fullResponse += delta.text;
                sentenceBuffer += delta.text;

                const sentenceEnd = this.findSentenceEnd(sentenceBuffer);
                if (sentenceEnd > 0) {
                    const sentence = sentenceBuffer.substring(0, sentenceEnd).trim();
                    sentenceBuffer = sentenceBuffer.substring(sentenceEnd);
                    if (sentence.length > 0) {
                        this.synthesizeAndPlay(session, sentence).catch(() => {});
                    }
                }
            }

            if (delta.usage) {
                session.totalTokens.prompt += delta.usage.promptTokens;
                session.totalTokens.completion += delta.usage.completionTokens;
            }
        }

        if (signal?.aborted) return;

        if (sentenceBuffer.trim().length > 0) {
            await this.synthesizeAndPlay(session, sentenceBuffer.trim());
        }

        // Recursive tool calls
        if (newToolCalls.length > 0) {
            session.addAssistantMessage(fullResponse, newToolCalls);
            await this.handleToolCalls(session, newToolCalls, tools, llmOptions);
        } else if (fullResponse) {
            session.addAssistantMessage(fullResponse);
        }
    }

    // ── TTS ─────────────────────────────────────────────────

    /**
     * Synthesize text and stream audio to Asterisk via StreamAudioService.
     */
    private async synthesizeAndPlay(session: NonRealtimeSession, text: string): Promise<void> {
        const { channelId, assistant } = session;
        const signal = session.pipelineAbort?.signal;
        const isPlayground = channelId.startsWith('playground-');

        const ttsProviderName = assistant['ttsProvider'] || 'silero';
        const ttsProvider = this.ttsProviders.get(ttsProviderName);
        if (!ttsProvider) {
            this.logger.error(`[${channelId}] TTS provider not found: ${ttsProviderName}`);
            return;
        }

        const ttsVoice = assistant['ttsVoice'] || assistant.voice || 'baya';
        const language = assistant.input_audio_transcription_language || 'ru';

        session.isSpeaking = true;

        // For telephony (Asterisk): initialize UDP/RTP stream
        // For playground (WebSocket): audio is emitted via EventEmitter, no UDP needed
        if (!isPlayground) {
            await this.streamAudioService.addStream(channelId, {
                external_local_Address: session.address,
                external_local_Port: Number(session.port),
            });
        }

        try {
            const audioStream = ttsProvider.synthesize(text, {
                voice: ttsVoice,
                sampleRate: 8000,
                language,
            }, signal);

            for await (const pcmChunk of audioStream) {
                if (signal?.aborted) return;

                if (isPlayground) {
                    // Playground: resample TTS output (48kHz) to 24kHz for browser AudioContext
                    // Browser expects PCM16 24kHz (same as OpenAI Realtime API format)
                    const resampled = ttsProvider.outputSampleRate !== 24000
                        ? this.audioService.resampleLinear(pcmChunk, ttsProvider.outputSampleRate, 24000)
                        : pcmChunk;
                    this.eventEmitter.emit(`audioDelta.${channelId}`, resampled);
                } else {
                    // Telephony: convert PCM16 to alaw and stream via UDP/RTP
                    let outputChunk: Buffer;
                    if (ttsProvider.outputSampleRate !== 8000) {
                        const resampled = this.audioService.resampleLinear(
                            pcmChunk,
                            ttsProvider.outputSampleRate,
                            8000,
                        );
                        outputChunk = this.audioService.pcm16ToAlaw(resampled);
                    } else {
                        outputChunk = this.audioService.pcm16ToAlaw(pcmChunk);
                    }

                    await this.streamAudioService.streamAudio(channelId, outputChunk);
                }
            }
        } finally {
            session.isSpeaking = false;
        }
    }

    // ── Helpers ──────────────────────────────────────────────

    /**
     * Build tools array from assistant config (same as realtime mode).
     */
    private async buildTools(assistant: Assistant): Promise<LlmTool[]> {
        const tools: LlmTool[] = [];

        // Assistant-defined tools
        if (assistant.tools?.length) {
            for (const tool of assistant.tools) {
                const data = (tool as any).toJSON?.() || (tool as any).dataValues || tool;
                if (data?.type === 'function') {
                    tools.push({
                        type: 'function',
                        function: {
                            name: data.name,
                            description: data.description || '',
                            parameters: data.parameters || {},
                        },
                    });
                }
            }
        }

        // Built-in: hangup
        if (assistant.allowHangup) {
            tools.push({
                type: 'function',
                function: {
                    name: 'hangup_call',
                    description: 'End the current call. Use this function when the conversation is clearly finished, the user has said goodbye, or the user explicitly asks to end the call.',
                    parameters: {
                        type: 'object',
                        properties: {
                            reason: { type: 'string', description: 'Brief reason for ending the call' },
                        },
                        required: ['reason'],
                        additionalProperties: false,
                    },
                },
            });
        }

        // Built-in: transfer
        if (assistant.allowTransfer) {
            tools.push({
                type: 'function',
                function: {
                    name: 'transfer_call',
                    description: 'Transfer the current call to another phone number or extension.',
                    parameters: {
                        type: 'object',
                        properties: {
                            exten: { type: 'string', description: 'The phone number or extension to transfer to' },
                        },
                        required: ['exten'],
                        additionalProperties: false,
                    },
                },
            });
        }

        // MCP tools
        try {
            const mcpServerIds = assistant.mcpServers?.map(s => s.id) || [];
            if (mcpServerIds.length > 0) {
                const mcpTools = await this.mcpToolRegistry.getToolsForOpenAI(mcpServerIds);
                for (const mt of mcpTools) {
                    tools.push({
                        type: 'function',
                        function: {
                            name: mt.name,
                            description: mt.description || '',
                            parameters: mt.parameters || {},
                        },
                    });
                }
            }
        } catch (e) {
            this.logger.warn(`Failed to load MCP tools: ${e.message}`);
        }

        return tools;
    }

    /**
     * Find the index of the end of a sentence for sentence-level TTS.
     * Returns the position after the sentence-ending character, or 0 if no sentence end found.
     */
    private findSentenceEnd(text: string): number {
        // Match sentence-ending punctuation followed by space or end of string
        const match = text.match(/[.!?;]\s|[.!?;]$/);
        if (match && match.index !== undefined) {
            return match.index + match[0].length;
        }

        // For very long text without punctuation, split at comma
        if (text.length > 200) {
            const commaIdx = text.lastIndexOf(',', 200);
            if (commaIdx > 50) {
                return commaIdx + 1;
            }
        }

        return 0;
    }

    /**
     * Emit events for logging and WebSocket UI.
     */
    private emitEvent(session: NonRealtimeSession, event: any): void {
        const { channelId, callerId, assistant } = session;

        try {
            if (channelId.startsWith('playground-')) {
                const socketId = channelId.replace('playground-', '');
                this.wsGateway.sendToPlayground(socketId, channelId, assistant.name, event);
            } else {
                this.wsGateway.sendToClient(channelId, callerId, assistant.name, assistant.userId, event);
            }

            this.aiCdrService.eventCreate({
                channelId,
                callerId,
                events: event,
                userId: assistant.userId,
                vPbxUserId: assistant.user?.vpbx_user_id,
            }).catch(() => {});
        } catch (e) {
            this.logger.error(`[${channelId}] Event emit error:`, e.message);
        }
    }
}
