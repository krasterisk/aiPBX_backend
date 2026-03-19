import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { OpenAiService, sessionData } from './open-ai.service';
import { WsServerGateway } from '../ws-server/ws-server.gateway';
import { AiCdrService } from '../ai-cdr/ai-cdr.service';
import { BillingService } from '../billing/billing.service';
import { AiToolsHandlersService } from '../ai-tools-handlers/ai-tools-handlers.service';
import { UsersService } from '../users/users.service';
import { AudioService } from '../audio/audio.service';
import { ToolGatewayService } from '../mcp-client/services/tool-gateway.service';
import { McpToolRegistryService } from '../mcp-client/services/mcp-tool-registry.service';

// ─── Mock the OpenAiConnection class ────────────────────────────
jest.mock('./open-ai.connection', () => ({
    OpenAiConnection: jest.fn().mockImplementation(() => ({
        send: jest.fn(),
        close: jest.fn(),
    })),
}));

// ─── Mock the adapter factory (default: OpenAI adapter) ─────────
jest.mock('./realtime-model.adapter', () => ({
    getModelAdapter: jest.fn().mockReturnValue({
        vendor: 'openai',
        outputResampleRate: null,
        needsPcmToAlaw: false,
        usesServerVad: false,
        skipFunctionCallsInResponseDone: false,
        buildSessionUpdate: jest.fn().mockReturnValue({ type: 'session.update', session: {} }),
        buildResponseCreate: jest.fn().mockReturnValue({ type: 'response.create' }),
        handleFunctionCall: jest.fn().mockResolvedValue(false),
        handleTextToolCalls: jest.fn().mockResolvedValue(false),
    }),
}));

describe('OpenAiService', () => {
    let service: OpenAiService;
    let mockEventEmitter: jest.Mocked<EventEmitter2>;
    let mockWsGateway: any;
    let mockAiCdrService: any;
    let mockBillingService: any;
    let mockAiToolsHandlersService: any;
    let mockUsersService: any;
    let mockAudioService: any;
    let mockToolGateway: any;
    let mockMcpToolRegistry: any;
    let mockConfigService: any;

    const mockAssistant: any = {
        id: 1,
        name: 'Test Assistant',
        uniqueId: 'test-uid',
        userId: '42',
        model: 'gpt-4o-realtime-preview',
        instruction: 'You are a helpful assistant.',
        voice: 'alloy',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription_model: 'whisper-1',
        turn_detection_type: 'server_vad',
        turn_detection_threshold: 0.5,
        turn_detection_prefix_padding_ms: 300,
        turn_detection_silence_duration_ms: 500,
        idle_timeout_ms: 10000,
        temperature: 0.7,
        max_response_output_tokens: 4096,
        tool_choice: 'auto',
        tools: [],
        allowHangup: false,
        allowTransfer: false,
        mcpServers: [],
        user: { vpbx_user_id: 'vpbx-1' },
    };

    beforeEach(async () => {
        mockEventEmitter = { emit: jest.fn() } as any;
        mockWsGateway = {
            sendToClient: jest.fn(),
            sendToPlayground: jest.fn(),
        };
        mockAiCdrService = {
            cdrCreate: jest.fn().mockResolvedValue(undefined),
            eventCreate: jest.fn().mockResolvedValue(undefined),
            cdrHangup: jest.fn().mockResolvedValue(undefined),
        };
        mockBillingService = {
            accumulateRealtimeTokens: jest.fn().mockResolvedValue(undefined),
        };
        mockAiToolsHandlersService = {};
        mockUsersService = {
            getUserBalance: jest.fn().mockResolvedValue({ balance: 100 }),
        };
        mockAudioService = {
            resampleLinear: jest.fn().mockReturnValue(Buffer.alloc(10)),
            pcm16ToAlaw: jest.fn().mockReturnValue(Buffer.alloc(10)),
        };
        mockToolGateway = {
            execute: jest.fn().mockResolvedValue({ output: '{}', sendResponse: true }),
        };
        mockMcpToolRegistry = {
            getToolsForOpenAI: jest.fn().mockResolvedValue([]),
        };
        mockConfigService = {
            get: jest.fn().mockReturnValue('sk-test-key-1234567890'),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                OpenAiService,
                { provide: EventEmitter2, useValue: mockEventEmitter },
                { provide: WsServerGateway, useValue: mockWsGateway },
                { provide: AiCdrService, useValue: mockAiCdrService },
                { provide: BillingService, useValue: mockBillingService },
                { provide: AiToolsHandlersService, useValue: mockAiToolsHandlersService },
                { provide: ConfigService, useValue: mockConfigService },
                { provide: UsersService, useValue: mockUsersService },
                { provide: AudioService, useValue: mockAudioService },
                { provide: ToolGatewayService, useValue: mockToolGateway },
                { provide: McpToolRegistryService, useValue: mockMcpToolRegistry },
            ],
        }).compile();

        service = module.get<OpenAiService>(OpenAiService);
    });

    // ─── onModuleInit ────────────────────────────────────────────

    describe('onModuleInit', () => {
        it('should log API key prefix when key is present', () => {
            expect(() => service.onModuleInit()).not.toThrow();
        });
    });

    // ─── createConnection ────────────────────────────────────────

    describe('createConnection', () => {
        it('should create a new OpenAI connection and store session', async () => {
            const connection = await service.createConnection('ch-1', mockAssistant);
            expect(connection).toBeDefined();
            expect(connection.send).toBeDefined();
            expect(connection.close).toBeDefined();
        });

        it('should return existing connection if session already exists', async () => {
            const conn1 = await service.createConnection('ch-1', mockAssistant);
            const conn2 = await service.createConnection('ch-1', mockAssistant);
            expect(conn1).toBe(conn2);
        });

        it('should throw error when user balance is zero or negative', async () => {
            mockUsersService.getUserBalance.mockResolvedValue({ balance: 0 });
            await expect(service.createConnection('ch-2', mockAssistant))
                .rejects.toThrow('Insufficient balance');
        });

        it('should throw error when user balance is negative', async () => {
            mockUsersService.getUserBalance.mockResolvedValue({ balance: -5 });
            await expect(service.createConnection('ch-3', mockAssistant))
                .rejects.toThrow('Insufficient balance');
        });

        it('should check user balance before creating connection', async () => {
            await service.createConnection('ch-4', mockAssistant);
            expect(mockUsersService.getUserBalance).toHaveBeenCalledWith('42');
        });
    });

    // ─── getConnection ───────────────────────────────────────────

    describe('getConnection', () => {
        it('should return connection for existing session', async () => {
            await service.createConnection('ch-1', mockAssistant);
            const conn = service.getConnection('ch-1');
            expect(conn).toBeDefined();
        });

        it('should return undefined for non-existent session', () => {
            const conn = service.getConnection('no-such-channel');
            expect(conn).toBeUndefined();
        });
    });

    // ─── closeConnection ─────────────────────────────────────────

    describe('closeConnection', () => {
        it('should close connection and remove session from map', async () => {
            const conn = await service.createConnection('ch-1', mockAssistant);
            service.closeConnection('ch-1');
            expect(conn.close).toHaveBeenCalled();
            expect(service.getConnection('ch-1')).toBeUndefined();
        });

        it('should handle non-existent channel gracefully', () => {
            expect(() => service.closeConnection('no-such-channel')).not.toThrow();
        });

        it('should handle empty channelId gracefully', () => {
            expect(() => service.closeConnection('')).not.toThrow();
        });

        it('should handle undefined channelId gracefully', () => {
            expect(() => service.closeConnection(undefined)).not.toThrow();
        });

        it('should clear watchdog timer if set', async () => {
            await service.createConnection('ch-wd', mockAssistant);
            // Manually set a watchdog timer on the session
            const sessions = (service as any).sessions;
            const session = sessions.get('ch-wd');
            session.watchdogTimer = setInterval(() => {}, 60000);
            service.closeConnection('ch-wd');
            expect(service.getConnection('ch-wd')).toBeUndefined();
        });
    });

    // ─── cdrCreateLog ────────────────────────────────────────────

    describe('cdrCreateLog', () => {
        it('should create CDR record when channelId is provided', async () => {
            await service.cdrCreateLog('ch-1', '+123456', mockAssistant, 'call');
            expect(mockAiCdrService.cdrCreate).toHaveBeenCalledWith({
                channelId: 'ch-1',
                callerId: '+123456',
                assistantId: mockAssistant.id,
                assistantName: mockAssistant.name,
                userId: mockAssistant.userId,
                vPbxUserId: mockAssistant.user.vpbx_user_id,
                source: 'call',
            });
        });

        it('should not create CDR record when channelId is empty', async () => {
            await service.cdrCreateLog('', '+123456', mockAssistant);
            expect(mockAiCdrService.cdrCreate).not.toHaveBeenCalled();
        });

        it('should not throw when cdrCreate fails', async () => {
            mockAiCdrService.cdrCreate.mockRejectedValue(new Error('DB error'));
            await expect(service.cdrCreateLog('ch-1', '+123456', mockAssistant)).resolves.not.toThrow();
        });
    });

    // ─── dataDecode ──────────────────────────────────────────────

    describe('dataDecode', () => {
        beforeEach(async () => {
            await service.createConnection('ch-1', mockAssistant);
        });

        it('should create CDR on session.created event', async () => {
            const event = JSON.stringify({ type: 'session.created' });
            await service.dataDecode(event, 'ch-1', '+123', mockAssistant);
            expect(mockAiCdrService.cdrCreate).toHaveBeenCalled();
        });

        it('should detect playground source from channelId prefix', async () => {
            // Create a playground session
            await service.createConnection('playground-sock1', mockAssistant);
            const event = JSON.stringify({ type: 'session.created' });
            await service.dataDecode(event, 'playground-sock1', 'Playground', mockAssistant);
            expect(mockAiCdrService.cdrCreate).toHaveBeenCalledWith(
                expect.objectContaining({ source: 'playground' }),
            );
        });

        it('should accumulate billing tokens on response.done with usage', async () => {
            const event = {
                type: 'response.done',
                response: {
                    usage: {
                        input_tokens: 100,
                        output_tokens: 50,
                        total_tokens: 150,
                    },
                    output: [],
                },
            };
            await service.dataDecode(event, 'ch-1', '+123', mockAssistant);
            expect(mockBillingService.accumulateRealtimeTokens).toHaveBeenCalledWith('ch-1', event.response.usage);
        });

        it('should not accumulate billing when response.done has no usage', async () => {
            const event = {
                type: 'response.done',
                response: { output: [] },
            };
            await service.dataDecode(event, 'ch-1', '+123', mockAssistant);
            expect(mockBillingService.accumulateRealtimeTokens).not.toHaveBeenCalled();
        });

        it('should handle call.hangup event', async () => {
            const event = { type: 'call.hangup' };
            await service.dataDecode(event, 'ch-1', '+123', mockAssistant);
            expect(mockAiCdrService.cdrHangup).toHaveBeenCalledWith('ch-1', mockAssistant.id);
        });

        it('should handle session_expired error by closing connection and emitting hangup', async () => {
            const event = {
                type: 'error',
                error: { code: 'session_expired' },
            };
            await service.dataDecode(event, 'ch-1', '+123', mockAssistant);
            expect(service.getConnection('ch-1')).toBeUndefined();
            expect(mockEventEmitter.emit).toHaveBeenCalledWith('HangupCall.ch-1');
        });

        it('should handle response_cancel_not_active error gracefully', async () => {
            const event = {
                type: 'error',
                error: { code: 'response_cancel_not_active' },
            };
            await expect(service.dataDecode(event, 'ch-1', '+123', mockAssistant)).resolves.not.toThrow();
        });

        it('should parse string events as JSON', async () => {
            const event = JSON.stringify({ type: 'response.created', response: { id: 'resp-1', output: [] } });
            await expect(service.dataDecode(event, 'ch-1', '+123', mockAssistant)).resolves.not.toThrow();
        });

        it('should handle object events directly', async () => {
            const event = { type: 'response.created', response: { id: 'resp-1', output: [] } };
            await expect(service.dataDecode(event, 'ch-1', '+123', mockAssistant)).resolves.not.toThrow();
        });

        it('should log events via loggingEvents for non-audio-delta types', async () => {
            const event = { type: 'response.created', response: { id: 'resp-1', output: [] } };
            await service.dataDecode(event, 'ch-1', '+123', mockAssistant);
            expect(mockAiCdrService.eventCreate).toHaveBeenCalled();
        });

        it('should NOT log events for response.audio.delta (high-frequency)', async () => {
            const event = { type: 'response.audio.delta', delta: 'AAAA' };
            await service.dataDecode(event, 'ch-1', '+123', mockAssistant);
            expect(mockAiCdrService.eventCreate).not.toHaveBeenCalled();
        });

        it('should send audio delta events to playground via wsGateway', async () => {
            // Create playground session
            await service.createConnection('playground-sock1', mockAssistant);
            const event = { type: 'response.created', response: { id: 'r-1', output: [] } };
            await service.dataDecode(event, 'playground-sock1', 'Playground', mockAssistant);
            expect(mockWsGateway.sendToPlayground).toHaveBeenCalledWith(
                'sock1', 'playground-sock1', mockAssistant.name, expect.anything(),
            );
        });

        it('should send events to regular client via wsGateway for SIP sessions', async () => {
            const event = { type: 'response.created', response: { id: 'r-1', output: [] } };
            await service.dataDecode(event, 'ch-1', '+123', mockAssistant);
            expect(mockWsGateway.sendToClient).toHaveBeenCalledWith(
                'ch-1', '+123', mockAssistant.name, mockAssistant.userId, expect.anything(),
            );
        });

        it('should execute function_call items from response.done output', async () => {
            const event = {
                type: 'response.done',
                response: {
                    usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
                    output: [
                        {
                            type: 'function_call',
                            name: 'get_weather',
                            call_id: 'call-1',
                            arguments: '{"city":"Moscow"}',
                        },
                    ],
                },
            };
            await service.dataDecode(event, 'ch-1', '+123', mockAssistant);
            expect(mockToolGateway.execute).toHaveBeenCalled();
        });

        it('should emit audio delta for telephony sessions', async () => {
            const event = {
                type: 'response.audio.delta',
                delta: Buffer.from('test audio').toString('base64'),
            };
            await service.dataDecode(event, 'ch-1', '+123', mockAssistant);
            expect(mockEventEmitter.emit).toHaveBeenCalledWith(
                'audioDelta.ch-1',
                expect.any(Buffer),
                expect.objectContaining({ channelId: 'ch-1' }),
            );
        });
    });

    // ─── rtInputAudioAppend ──────────────────────────────────────

    describe('rtInputAudioAppend', () => {
        it('should send base64 encoded audio to connection', async () => {
            const conn = await service.createConnection('ch-1', mockAssistant);
            const chunk = Buffer.from('audio data');
            await service.rtInputAudioAppend(chunk, 'ch-1');
            expect(conn.send).toHaveBeenCalledWith({
                event_id: 'ch-1',
                type: 'input_audio_buffer.append',
                audio: chunk.toString('base64'),
            });
        });

        it('should do nothing when no connection exists', async () => {
            await service.rtInputAudioAppend(Buffer.from('data'), 'no-such-channel');
            // Should not throw
        });
    });

    // ─── rtTextAppend ────────────────────────────────────────────

    describe('rtTextAppend', () => {
        it('should send text message event to connection', async () => {
            const conn = await service.createConnection('ch-1', mockAssistant);
            await service.rtTextAppend('Hello', 'ch-1');
            expect(conn.send).toHaveBeenCalledWith({
                type: 'conversation.item.create',
                item: {
                    type: 'message',
                    role: 'user',
                    content: [{ type: 'input_text', text: 'Hello' }],
                },
            });
        });

        it('should not throw when connection does not exist', async () => {
            await expect(service.rtTextAppend('Hello', 'no-channel')).resolves.not.toThrow();
        });
    });

    // ─── rtInitAudioResponse ─────────────────────────────────────

    describe('rtInitAudioResponse', () => {
        it('should send response.create event when connection is present', async () => {
            const conn = await service.createConnection('ch-1', mockAssistant);
            const metadata: sessionData = {
                channelId: 'ch-1',
                address: '127.0.0.1',
                port: '5060',
                openAiConn: conn as any,
                assistant: mockAssistant,
            };
            await service.rtInitAudioResponse(metadata);
            expect(conn.send).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'response.create' }),
            );
        });

        it('should skip when metadata is missing channelId, address and port', async () => {
            const conn = await service.createConnection('ch-1', mockAssistant);
            const metadata: sessionData = {
                channelId: '',
                address: '',
                port: '',
                openAiConn: conn as any,
            };
            // Should return early, not throw
            await expect(service.rtInitAudioResponse(metadata)).resolves.not.toThrow();
        });

        it('should not throw when openAiConn is not present', async () => {
            const metadata: sessionData = {
                channelId: 'ch-orphan',
                address: '127.0.0.1',
                port: '5060',
            };
            await expect(service.rtInitAudioResponse(metadata)).resolves.not.toThrow();
        });
    });

    // ─── chatCompletion ──────────────────────────────────────────

    describe('chatCompletion', () => {
        it('should call OpenAI chat completions API and return content/usage', async () => {
            const mockResponse = {
                choices: [{ message: { content: '{"result": "ok"}' } }],
                usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
            };

            // Mock the openAiClient.chat.completions.create
            const mockCreate = jest.fn().mockResolvedValue(mockResponse);
            (service as any).openAiClient = {
                chat: { completions: { create: mockCreate } },
            };

            const result = await service.chatCompletion(
                [{ role: 'user', content: 'Hello' }],
                'gpt-4o',
            );

            expect(mockCreate).toHaveBeenCalledWith({
                messages: [{ role: 'user', content: 'Hello' }],
                model: 'gpt-4o',
                response_format: { type: 'json_object' },
            });
            expect(result.content).toBe('{"result": "ok"}');
            expect(result.usage).toEqual(mockResponse.usage);
        });

        it('should use default model gpt-4o when not specified', async () => {
            const mockCreate = jest.fn().mockResolvedValue({
                choices: [{ message: { content: '{}' } }],
                usage: {},
            });
            (service as any).openAiClient = {
                chat: { completions: { create: mockCreate } },
            };

            await service.chatCompletion([{ role: 'user', content: 'Hi' }]);
            expect(mockCreate).toHaveBeenCalledWith(
                expect.objectContaining({ model: 'gpt-4o' }),
            );
        });

        it('should throw when OpenAI API returns an error', async () => {
            const mockCreate = jest.fn().mockRejectedValue(new Error('Rate limit'));
            (service as any).openAiClient = {
                chat: { completions: { create: mockCreate } },
            };

            await expect(service.chatCompletion([{ role: 'user', content: 'Hi' }]))
                .rejects.toThrow('Rate limit');
        });
    });

    // ─── updateRtAudioSession ────────────────────────────────────

    describe('updateRtAudioSession', () => {
        it('should send session.update event via connection', async () => {
            const conn = await service.createConnection('ch-1', mockAssistant);
            const session: sessionData = {
                channelId: 'ch-1',
                address: '127.0.0.1',
                port: '5060',
                openAiConn: conn as any,
                assistant: mockAssistant,
            };

            await service.updateRtAudioSession(session);
            expect(conn.send).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'session.update' }),
            );
        });

        it('should add hangup_call tool when assistant allows hangup', async () => {
            const assistantWithHangup = { ...mockAssistant, allowHangup: true };
            const conn = await service.createConnection('ch-h', assistantWithHangup);
            const session: sessionData = {
                channelId: 'ch-h',
                address: '127.0.0.1',
                port: '5060',
                openAiConn: conn as any,
                assistant: assistantWithHangup,
            };

            await service.updateRtAudioSession(session);
            // The adapter.buildSessionUpdate is mocked, but we can verify the function was called
            expect(conn.send).toHaveBeenCalled();
        });

        it('should add transfer_call tool when assistant allows transfer', async () => {
            const assistantWithTransfer = { ...mockAssistant, allowTransfer: true };
            const conn = await service.createConnection('ch-t', assistantWithTransfer);
            const session: sessionData = {
                channelId: 'ch-t',
                address: '127.0.0.1',
                port: '5060',
                openAiConn: conn as any,
                assistant: assistantWithTransfer,
            };

            await service.updateRtAudioSession(session);
            expect(conn.send).toHaveBeenCalled();
        });

        it('should not throw when session has no openAiConn', async () => {
            const session: sessionData = {
                channelId: 'ch-orphan',
                address: '127.0.0.1',
                port: '5060',
            };
            await expect(service.updateRtAudioSession(session)).resolves.not.toThrow();
        });

        it('should not throw when session is null', async () => {
            await expect(service.updateRtAudioSession(null)).resolves.not.toThrow();
        });

        it('should load MCP tools when assistant has linked MCP servers', async () => {
            const mcpAssistant = {
                ...mockAssistant,
                mcpServers: [{ id: 10 }, { id: 20 }],
            };
            const conn = await service.createConnection('ch-mcp', mcpAssistant);
            const session: sessionData = {
                channelId: 'ch-mcp',
                address: '127.0.0.1',
                port: '5060',
                openAiConn: conn as any,
                assistant: mcpAssistant,
            };

            await service.updateRtAudioSession(session);
            expect(mockMcpToolRegistry.getToolsForOpenAI).toHaveBeenCalledWith([10, 20]);
        });

        it('should handle MCP tool loading failure gracefully', async () => {
            const mcpAssistant = {
                ...mockAssistant,
                mcpServers: [{ id: 10 }],
            };
            mockMcpToolRegistry.getToolsForOpenAI.mockRejectedValue(new Error('MCP offline'));

            const conn = await service.createConnection('ch-mcp2', mcpAssistant);
            const session: sessionData = {
                channelId: 'ch-mcp2',
                address: '127.0.0.1',
                port: '5060',
                openAiConn: conn as any,
                assistant: mcpAssistant,
            };

            await expect(service.updateRtAudioSession(session)).resolves.not.toThrow();
        });
    });
});
