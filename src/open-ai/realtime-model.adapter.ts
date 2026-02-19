import { Logger } from '@nestjs/common';
import { ToolGatewayService } from '../mcp-client/services/tool-gateway.service';

const logger = new Logger('RealtimeModelAdapter');

// ────────────────────────────────────────────────────────────────
// Interface
// ────────────────────────────────────────────────────────────────

export interface RealtimeModelAdapter {
    readonly vendor: 'openai' | 'yandex' | 'qwen';

    /** Build the `session.update` event payload */
    buildSessionUpdate(assistant: any, tools: any[], instructions: string): object;

    /** Sanitize / normalise tool definitions for this vendor */
    sanitizeTools(tools: any[]): any[];

    /** Output audio resample rate (null = no resampling needed) */
    readonly outputResampleRate: number | null;

    /** Whether PCM16→ALAW resampling is needed for telephony */
    readonly needsPcmToAlaw: boolean;

    /** Whether this vendor uses server-side VAD (skip manual cancel / commit) */
    readonly usesServerVad: boolean;

    /** Whether function_call items should be skipped in response.done (handled elsewhere) */
    readonly skipFunctionCallsInResponseDone: boolean;

    /** Build a `response.create` event (for after function-call output, etc.) */
    buildResponseCreate(): object;

    /**
     * Handle a function_call from `response.output_item.done`.
     * Returns true if a function call was processed.
     */
    handleFunctionCall(
        serverEvent: any,
        currentSession: any,
        assistant: any,
        toolGateway: ToolGatewayService,
    ): Promise<boolean>;

    /**
     * Intercept text-based tool calls (e.g. `[TOOL_CALL_START]`) from `response.output_text.done`.
     * Returns true if any tool calls were found and executed.
     */
    handleTextToolCalls(
        serverEvent: any,
        currentSession: any,
        assistant: any,
        toolGateway: ToolGatewayService,
    ): Promise<boolean>;
}

// ────────────────────────────────────────────────────────────────
// Shared helpers
// ────────────────────────────────────────────────────────────────

/** Parse `parameters` that may be a JSON string, null, or object. Returns a copy. */
function normaliseParams(raw: any): any {
    let params = raw;

    if (typeof params === 'string') {
        try { params = JSON.parse(params); } catch { params = null; }
    }

    if (params && typeof params === 'object') {
        params = JSON.parse(JSON.stringify(params)); // deep-clone
    }

    if (!params || typeof params !== 'object' || !params.type) {
        params = { type: 'object', properties: {}, required: [], additionalProperties: false };
    }

    if (params.type === 'object') {
        if (!params.properties || typeof params.properties !== 'object') {
            params.properties = {};
        }
        if (!Array.isArray(params.required)) {
            params.required = Object.keys(params.properties);
        }
        params.additionalProperties = false;
    }

    delete params.$schema;
    delete params.definitions;
    return params;
}

/**
 * Execute a function call item through the tool gateway, send the result back,
 * and request a new response from the model.
 */
async function executeFunctionCallItem(
    item: any,
    currentSession: any,
    assistant: any,
    toolGateway: ToolGatewayService,
    responseCreateEvent: object,
    label: string,
): Promise<void> {
    logger.log(`[${label}] Function call: ${item.name}, call_id: ${item.call_id}`);

    const { output: toolOutput, sendResponse } = await toolGateway.execute(
        item, currentSession, assistant,
    );

    if (sendResponse && toolOutput) {
        logger.log(`[${label}] Tool result:`, toolOutput);

        currentSession.openAiConn.send({
            type: 'conversation.item.create',
            item: {
                type: 'function_call_output',
                call_id: item.call_id,
                output: toolOutput,
            },
        });

        logger.log(`[${label}] Sending response.create after function call`);
        currentSession.openAiConn.send(responseCreateEvent);
    }
}

// ────────────────────────────────────────────────────────────────
// OpenAI Adapter
// ────────────────────────────────────────────────────────────────

export class OpenAiAdapter implements RealtimeModelAdapter {
    readonly vendor = 'openai' as const;
    readonly outputResampleRate = null;
    readonly needsPcmToAlaw = false;
    readonly usesServerVad = false;
    readonly skipFunctionCallsInResponseDone = false;

    sanitizeTools(tools: any[]): any[] {
        return tools; // OpenAI handles any valid JSON Schema
    }

    buildSessionUpdate(assistant: any, tools: any[], instructions: string): object {
        return {
            type: 'session.update',
            session: {
                modalities: ['text', 'audio'],
                instructions,
                voice: assistant.voice,
                input_audio_format: assistant.input_audio_format,
                output_audio_format: assistant.output_audio_format,
                input_audio_transcription: {
                    model: assistant.input_audio_transcription_model || 'whisper-1',
                    ...(assistant.input_audio_transcription_language && {
                        language: assistant.input_audio_transcription_language,
                    }),
                },
                turn_detection: {
                    type: assistant.turn_detection_type,
                    threshold: Number(assistant.turn_detection_threshold),
                    prefix_padding_ms: Number(assistant.turn_detection_prefix_padding_ms),
                    silence_duration_ms: Number(assistant.turn_detection_silence_duration_ms),
                    create_response: false,
                    interrupt_response: false,
                    idle_timeout_ms: Number(assistant.idle_timeout_ms) || 10000,
                },
                temperature: Number(assistant.temperature),
                max_response_output_tokens: assistant.max_response_output_tokens,
                tools,
                tool_choice: assistant.tool_choice || 'auto',
            },
        };
    }

    buildResponseCreate(): object {
        return {
            type: 'response.create',
            response: {
                modalities: ['text', 'audio'],
            },
        };
    }

    async handleFunctionCall(): Promise<boolean> {
        return false; // OpenAI handles function calls in response.done
    }

    async handleTextToolCalls(): Promise<boolean> {
        return false; // OpenAI doesn't produce text-based tool calls
    }
}

// ────────────────────────────────────────────────────────────────
// Qwen Adapter
// ────────────────────────────────────────────────────────────────

export class QwenAdapter implements RealtimeModelAdapter {
    readonly vendor = 'qwen' as const;
    readonly outputResampleRate = 24000;
    readonly needsPcmToAlaw = true;
    readonly usesServerVad = true;
    readonly skipFunctionCallsInResponseDone = false;

    sanitizeTools(tools: any[]): any[] {
        return tools; // Qwen accepts standard format
    }

    buildSessionUpdate(assistant: any, tools: any[], instructions: string): object {
        return {
            type: 'session.update',
            session: {
                modalities: ['text', 'audio'],
                instructions,
                voice: assistant.voice,
                input_audio_format: assistant.input_audio_format,
                output_audio_format: assistant.output_audio_format,
                input_audio_transcription: {
                    model: assistant.input_audio_transcription_model || 'whisper-1',
                    ...(assistant.input_audio_transcription_language && {
                        language: assistant.input_audio_transcription_language,
                    }),
                },
                turn_detection: {
                    type: assistant.turn_detection_type,
                    threshold: Number(assistant.turn_detection_threshold),
                    prefix_padding_ms: Number(assistant.turn_detection_prefix_padding_ms),
                    silence_duration_ms: Number(assistant.turn_detection_silence_duration_ms),
                    create_response: true,
                    interrupt_response: true,
                    idle_timeout_ms: Number(assistant.idle_timeout_ms) || 10000,
                },
                temperature: Number(assistant.temperature),
                max_response_output_tokens: assistant.max_response_output_tokens,
                tools,
                tool_choice: assistant.tool_choice || 'auto',
            },
        };
    }

    buildResponseCreate(): object {
        return {
            type: 'response.create',
            response: {
                modalities: ['text', 'audio'],
            },
        };
    }

    async handleFunctionCall(): Promise<boolean> {
        return false; // Qwen handles function calls in response.done like OpenAI
    }

    async handleTextToolCalls(): Promise<boolean> {
        return false;
    }
}

// ────────────────────────────────────────────────────────────────
// Yandex Adapter
// ────────────────────────────────────────────────────────────────

export class YandexAdapter implements RealtimeModelAdapter {
    readonly vendor = 'yandex' as const;
    readonly outputResampleRate = 24000;
    readonly needsPcmToAlaw = true;
    readonly usesServerVad = true;
    readonly skipFunctionCallsInResponseDone = true;

    sanitizeTools(tools: any[]): any[] {
        return tools.map(tool => {
            if (tool.type !== 'function') return tool;
            return {
                type: 'function',
                name: tool.name,
                description: tool.description || tool.name,
                parameters: normaliseParams(tool.parameters),
            };
        });
    }

    buildSessionUpdate(assistant: any, tools: any[], instructions: string): object {
        const sanitized = this.sanitizeTools(tools);
        logger.log(`[Yandex] Tools payload (${sanitized.length} tools):`);
        logger.log(JSON.stringify(sanitized, null, 2));

        return {
            type: 'session.update',
            session: {
                instructions,
                output_modalities: ['audio'],
                audio: {
                    input: {
                        format: {
                            type: 'audio/pcm',
                            rate: 24000,
                            channels: 1,
                        },
                        turn_detection: {
                            type: 'server_vad',
                            threshold: Number(assistant.turn_detection_threshold) || 0.5,
                            silence_duration_ms: Number(assistant.turn_detection_silence_duration_ms) || 400,
                        },
                    },
                    output: {
                        format: {
                            type: 'audio/pcm',
                            rate: 24000,
                        },
                        voice: assistant.voice || 'dasha',
                    },
                },
                tools: sanitized,
            },
        };
    }

    buildResponseCreate(): object {
        return { type: 'response.create' };
    }

    async handleFunctionCall(
        serverEvent: any,
        currentSession: any,
        assistant: any,
        toolGateway: ToolGatewayService,
    ): Promise<boolean> {
        if (serverEvent.type !== 'response.output_item.done') return false;

        const item = serverEvent?.item;
        if (item?.type !== 'function_call') return false;

        try {
            await executeFunctionCallItem(
                item, currentSession, assistant, toolGateway,
                this.buildResponseCreate(), 'Yandex',
            );
        } catch (error) {
            logger.error(`[Yandex] Tool ${item.name} execution error:`, error.message);
        }

        return true;
    }

    async handleTextToolCalls(
        serverEvent: any,
        currentSession: any,
        assistant: any,
        toolGateway: ToolGatewayService,
    ): Promise<boolean> {
        if (serverEvent.type !== 'response.output_text.done') return false;

        const text: string = serverEvent?.text || '';
        const toolCallRegex = /\[TOOL_CALL_START\](\S+)\s*\n(\{[\s\S]*?\})/g;
        let match: RegExpExecArray | null;
        let found = false;

        while ((match = toolCallRegex.exec(text)) !== null) {
            found = true;
            const toolName = match[1];
            const toolArgs = match[2];

            logger.log(`[Yandex] Text-based tool call detected: ${toolName}, args: ${toolArgs}`);

            try {
                const fakeItem = {
                    name: toolName,
                    call_id: `text_call_${Date.now()}_${toolName}`,
                    arguments: toolArgs,
                };

                const { output: toolOutput, sendResponse } = await toolGateway.execute(
                    fakeItem, currentSession, assistant,
                );

                if (sendResponse && toolOutput) {
                    logger.log(`[Yandex] Text-based tool result for ${toolName}:`, toolOutput);
                }
            } catch (error) {
                logger.error(`[Yandex] Text-based tool ${toolName} error:`, error.message);
            }
        }

        return found;
    }
}

// ────────────────────────────────────────────────────────────────
// Factory
// ────────────────────────────────────────────────────────────────

const openAiAdapter = new OpenAiAdapter();
const qwenAdapter = new QwenAdapter();
const yandexAdapter = new YandexAdapter();

export function getModelAdapter(model: string): RealtimeModelAdapter {
    if (model?.startsWith('yandex')) return yandexAdapter;
    if (model?.startsWith('qwen')) return qwenAdapter;
    return openAiAdapter;
}
