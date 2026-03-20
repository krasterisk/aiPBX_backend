import { Logger } from '@nestjs/common';
import { LlmMessage } from './interfaces/llm-provider.interface';
import { Assistant } from '../assistants/assistants.model';

/**
 * Per-call session state for non-realtime pipeline.
 * Manages conversation history, audio buffers, and abort controllers.
 */
export class NonRealtimeSession {
    private readonly logger = new Logger(NonRealtimeSession.name);

    /** Unique channel ID from Asterisk */
    public readonly channelId: string;
    /** Caller ID */
    public readonly callerId: string;
    /** Assistant config */
    public readonly assistant: Assistant;
    /** RTP target address */
    public address: string = '';
    /** RTP target port */
    public port: string = '';

    /** Conversation history for LLM */
    public messages: LlmMessage[] = [];

    // ── VAD State ───────────────────────────────────────────

    /** Current VAD state */
    public vadState: 'idle' | 'speaking' = 'idle';
    /** Audio buffer accumulating speech frames */
    public speechBuffer: Buffer[] = [];
    /** Ring buffer for prefix padding (pre-speech audio) */
    public prefixBuffer: Buffer[] = [];
    /** Max frames to keep in prefix buffer */
    public prefixMaxFrames: number = 0;
    /** Consecutive silence duration in ms */
    public silenceMs: number = 0;

    // ── Pipeline Control ────────────────────────────────────

    /** AbortController for current LLM + TTS pipeline (for interrupt) */
    public pipelineAbort: AbortController | null = null;
    /** Whether the bot is currently speaking (TTS playing) */
    public isSpeaking: boolean = false;
    /** Timestamp of last activity (for watchdog) */
    public lastActivityAt: number = Date.now();

    // ── Metrics ─────────────────────────────────────────────

    /** Total tokens used in this session */
    public totalTokens: { prompt: number; completion: number } = { prompt: 0, completion: 0 };

    constructor(channelId: string, callerId: string, assistant: Assistant) {
        this.channelId = channelId;
        this.callerId = callerId;
        this.assistant = assistant;

        // Initialize system prompt
        const customerPhone = callerId && callerId !== 'Playground'
            ? `Customer phone number is ${callerId}. Use customer phone if necessary, example, when calling the create order tool.`
            : '';

        this.messages = [
            {
                role: 'system',
                content: (assistant.instruction || '') + ' ' + customerPhone,
            },
        ];

        // Calculate prefix buffer size from assistant config
        const prefixPaddingMs = Number(assistant.turn_detection_prefix_padding_ms) || 300;
        const frameDurationMs = 30; // Silero VAD frame size
        this.prefixMaxFrames = Math.ceil(prefixPaddingMs / frameDurationMs);

        this.logger.log(`[${channelId}] Session created. System prompt: ${this.messages[0].content.length} chars`);
    }

    /**
     * Add an audio frame to the prefix ring buffer.
     * When speech starts, these frames are prepended to the speech buffer.
     */
    addToPrefixBuffer(frame: Buffer): void {
        this.prefixBuffer.push(frame);
        if (this.prefixBuffer.length > this.prefixMaxFrames) {
            this.prefixBuffer.shift();
        }
    }

    /**
     * Start speech: move prefix buffer to speech buffer.
     */
    startSpeech(): void {
        this.vadState = 'speaking';
        this.silenceMs = 0;
        // Prepend prefix buffer to capture audio before speech_start
        this.speechBuffer = [...this.prefixBuffer];
        this.prefixBuffer = [];
    }

    /**
     * Collect the full speech buffer and reset.
     * @returns Concatenated PCM16 audio buffer
     */
    collectSpeechBuffer(): Buffer {
        const fullBuffer = Buffer.concat(this.speechBuffer);
        this.speechBuffer = [];
        this.vadState = 'idle';
        this.silenceMs = 0;
        return fullBuffer;
    }

    /**
     * Abort the current pipeline (LLM + TTS) for interrupt.
     */
    abortPipeline(): void {
        if (this.pipelineAbort) {
            this.pipelineAbort.abort();
            this.pipelineAbort = null;
        }
        this.isSpeaking = false;
    }

    /**
     * Create a new AbortController for a new pipeline run.
     */
    newPipeline(): AbortController {
        this.abortPipeline();
        this.pipelineAbort = new AbortController();
        return this.pipelineAbort;
    }

    /**
     * Add a user message to conversation history.
     */
    addUserMessage(text: string): void {
        this.messages.push({ role: 'user', content: text });
        this.trimHistory();
    }

    /**
     * Add an assistant message to conversation history.
     */
    addAssistantMessage(content: string, toolCalls?: any[]): void {
        const msg: LlmMessage = { role: 'assistant', content };
        if (toolCalls?.length) {
            msg.tool_calls = toolCalls;
        }
        this.messages.push(msg);
        this.trimHistory();
    }

    /**
     * Add a tool result to conversation history.
     */
    addToolResult(toolCallId: string, name: string, output: string): void {
        this.messages.push({
            role: 'tool',
            tool_call_id: toolCallId,
            name,
            content: output,
        });
    }

    /**
     * Keep conversation history bounded to prevent unbounded memory growth.
     * Keeps system message + last N messages.
     */
    private trimHistory(maxMessages: number = 50): void {
        if (this.messages.length <= maxMessages) return;

        const systemMsg = this.messages[0]; // Always keep system prompt
        const recent = this.messages.slice(-(maxMessages - 1));
        this.messages = [systemMsg, ...recent];
        this.logger.debug(`[${this.channelId}] Trimmed history to ${this.messages.length} messages`);
    }

    /**
     * Cleanup session resources.
     */
    destroy(): void {
        this.abortPipeline();
        this.speechBuffer = [];
        this.prefixBuffer = [];
        this.messages = [];
    }
}
