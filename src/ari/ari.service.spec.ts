import { Test, TestingModule } from '@nestjs/testing';

// ─── Module-level mocks (must come before imports of real modules) ───
// This prevents Jest from loading ESM-only transitive dependencies (e.g. nanoid)

jest.mock('../pbx-servers/pbx-servers.service');
jest.mock('../rtp-udp-server/rtp-udp-server.service');
jest.mock('../open-ai/open-ai.service');
jest.mock('../audio/streamAudio.service');
jest.mock('../assistants/assistants.service');
jest.mock('../widget-keys/widget-keys.service');
jest.mock('nanoid', () => ({ nanoid: () => 'mock-nanoid-id' }));

// Shared mocks for AriConnection instances
const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockDisconnect = jest.fn().mockResolvedValue(undefined);
const mockIsOnline = jest.fn().mockReturnValue(true);

// Each AriConnection instance gets its own getServerId that returns server.uniqueId
jest.mock('./ari-connection', () => {
    return {
        AriConnection: jest.fn().mockImplementation((server: any) => ({
            connect: mockConnect,
            disconnect: mockDisconnect,
            getServerId: jest.fn().mockReturnValue(server.uniqueId),
            isOnline: mockIsOnline,
        })),
    };
});

import { AriService } from './ari.service';
import { PbxServersService } from '../pbx-servers/pbx-servers.service';
import { RtpUdpServerService } from '../rtp-udp-server/rtp-udp-server.service';
import { OpenAiService } from '../open-ai/open-ai.service';
import { StreamAudioService } from '../audio/streamAudio.service';
import { AssistantsService } from '../assistants/assistants.service';
import { WidgetKeysService } from '../widget-keys/widget-keys.service';
import { AriConnection } from './ari-connection';

describe('AriService', () => {
    let service: AriService;
    let mockPbxServersService: any;
    let mockRtpUdpServerService: any;
    let mockOpenAiService: any;
    let mockStreamAudioService: any;
    let mockAssistantsService: any;
    let mockWidgetKeysService: any;

    // ─── Mock PBX Servers Data ──────────────────────────────────────────

    const mockServer1 = {
        id: 1,
        uniqueId: 'server-uuid-001',
        name: 'Office PBX',
        ari_url: 'http://192.168.1.100:8088',
        ari_login: 'admin',
        ari_password: 'secret',
    };

    const mockServer2 = {
        id: 2,
        uniqueId: 'server-uuid-002',
        name: 'Cloud PBX',
        ari_url: 'http://10.0.0.50:8088',
        ari_login: 'admin',
        ari_password: 'secret2',
    };

    // ─── Setup ──────────────────────────────────────────────────────────

    beforeEach(async () => {
        jest.clearAllMocks();

        mockPbxServersService = { getAll: jest.fn() };
        mockRtpUdpServerService = {};
        mockOpenAiService = {};
        mockStreamAudioService = {};
        mockAssistantsService = {};
        mockWidgetKeysService = {};

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AriService,
                { provide: PbxServersService, useValue: mockPbxServersService },
                { provide: RtpUdpServerService, useValue: mockRtpUdpServerService },
                { provide: OpenAiService, useValue: mockOpenAiService },
                { provide: StreamAudioService, useValue: mockStreamAudioService },
                { provide: AssistantsService, useValue: mockAssistantsService },
                { provide: WidgetKeysService, useValue: mockWidgetKeysService },
            ],
        }).compile();

        service = module.get<AriService>(AriService);
    });

    // ─── onModuleInit ───────────────────────────────────────────────────

    describe('onModuleInit', () => {
        it('should connect to all PBX servers found in database', async () => {
            mockPbxServersService.getAll.mockResolvedValue([mockServer1, mockServer2]);

            await service.onModuleInit();

            expect(mockPbxServersService.getAll).toHaveBeenCalled();
            expect(AriConnection).toHaveBeenCalledTimes(2);
            expect(mockConnect).toHaveBeenCalledTimes(2);
        });

        it('should do nothing when no servers found', async () => {
            mockPbxServersService.getAll.mockResolvedValue([]);

            await service.onModuleInit();

            expect(AriConnection).not.toHaveBeenCalled();
            expect(mockConnect).not.toHaveBeenCalled();
        });

        it('should do nothing when getAll returns null', async () => {
            mockPbxServersService.getAll.mockResolvedValue(null);

            await service.onModuleInit();

            expect(AriConnection).not.toHaveBeenCalled();
        });

        it('should store all connections after init', async () => {
            mockPbxServersService.getAll.mockResolvedValue([mockServer1, mockServer2]);

            await service.onModuleInit();

            expect(service.getConnections()).toHaveLength(2);
        });
    });

    // ─── connectToPbx ───────────────────────────────────────────────────

    describe('connectToPbx', () => {
        it('should create AriConnection with correct dependencies and connect', async () => {
            await service.connectToPbx(mockServer1 as any);

            expect(AriConnection).toHaveBeenCalledWith(
                mockServer1,
                mockRtpUdpServerService,
                mockOpenAiService,
                mockStreamAudioService,
                mockAssistantsService,
                mockWidgetKeysService,
            );
            expect(mockConnect).toHaveBeenCalledTimes(1);
        });

        it('should add connection to internal connections list', async () => {
            await service.connectToPbx(mockServer1 as any);

            expect(service.getConnections()).toHaveLength(1);
        });

        it('should disconnect existing connection before reconnecting (same server)', async () => {
            // Connect first time
            await service.connectToPbx(mockServer1 as any);
            expect(service.getConnections()).toHaveLength(1);

            // Connect second time — should disconnect old, then add new
            await service.connectToPbx(mockServer1 as any);

            expect(mockDisconnect).toHaveBeenCalledTimes(1); // old one disconnected
            expect(service.getConnections()).toHaveLength(1); // still only one connection
        });

        it('should handle connection error gracefully without throwing', async () => {
            mockConnect.mockRejectedValueOnce(new Error('Connection refused'));

            // Should NOT throw
            await expect(service.connectToPbx(mockServer1 as any)).resolves.toBeUndefined();

            // Connection should not be added on failure
            expect(service.getConnections()).toHaveLength(0);
        });

        it('should handle non-Error thrown object gracefully', async () => {
            mockConnect.mockRejectedValueOnce('string error');

            await expect(service.connectToPbx(mockServer1 as any)).resolves.toBeUndefined();
            expect(service.getConnections()).toHaveLength(0);
        });
    });

    // ─── disconnectFromPbx ──────────────────────────────────────────────

    describe('disconnectFromPbx', () => {
        it('should disconnect and remove connection by uniqueId', async () => {
            await service.connectToPbx(mockServer1 as any);
            expect(service.getConnections()).toHaveLength(1);

            await service.disconnectFromPbx('server-uuid-001');

            expect(mockDisconnect).toHaveBeenCalledTimes(1);
            expect(service.getConnections()).toHaveLength(0);
        });

        it('should do nothing when no connection matches the uniqueId', async () => {
            await service.connectToPbx(mockServer1 as any);

            await service.disconnectFromPbx('nonexistent-id');

            expect(mockDisconnect).not.toHaveBeenCalled();
            expect(service.getConnections()).toHaveLength(1);
        });

        it('should only remove the matching connection when multiple exist', async () => {
            await service.connectToPbx(mockServer1 as any);
            await service.connectToPbx(mockServer2 as any);
            expect(service.getConnections()).toHaveLength(2);

            await service.disconnectFromPbx('server-uuid-001');

            expect(service.getConnections()).toHaveLength(1);
            expect(service.getConnections()[0].getServerId()).toBe('server-uuid-002');
        });
    });

    // ─── onModuleDestroy ────────────────────────────────────────────────

    describe('onModuleDestroy', () => {
        it('should disconnect all connections and clear the list', async () => {
            await service.connectToPbx(mockServer1 as any);
            await service.connectToPbx(mockServer2 as any);

            expect(service.getConnections()).toHaveLength(2);

            await service.onModuleDestroy();

            expect(mockDisconnect).toHaveBeenCalledTimes(2);
            expect(service.getConnections()).toHaveLength(0);
        });

        it('should handle disconnect errors gracefully', async () => {
            await service.connectToPbx(mockServer1 as any);

            mockDisconnect.mockRejectedValueOnce(new Error('Disconnect failed'));

            // Should not throw even if disconnect fails
            await expect(service.onModuleDestroy()).resolves.toBeUndefined();
            expect(service.getConnections()).toHaveLength(0);
        });

        it('should work fine with no connections', async () => {
            await expect(service.onModuleDestroy()).resolves.toBeUndefined();
            expect(service.getConnections()).toHaveLength(0);
        });
    });

    // ─── getConnections ─────────────────────────────────────────────────

    describe('getConnections', () => {
        it('should return empty array initially', () => {
            expect(service.getConnections()).toEqual([]);
        });

        it('should return all active connections', async () => {
            await service.connectToPbx(mockServer1 as any);

            const connections = service.getConnections();
            expect(connections).toHaveLength(1);
        });
    });

    // ─── getConnectionByServerId ────────────────────────────────────────

    describe('getConnectionByServerId', () => {
        it('should return connection matching the serverId', async () => {
            await service.connectToPbx(mockServer1 as any);

            const connection = service.getConnectionByServerId('server-uuid-001');
            expect(connection).toBeDefined();
            expect(connection!.getServerId()).toBe('server-uuid-001');
        });

        it('should return undefined when no connection matches', async () => {
            await service.connectToPbx(mockServer1 as any);

            const connection = service.getConnectionByServerId('nonexistent');
            expect(connection).toBeUndefined();
        });

        it('should return undefined when no connections exist', () => {
            const connection = service.getConnectionByServerId('server-uuid-001');
            expect(connection).toBeUndefined();
        });

        it('should find correct connection among multiple', async () => {
            await service.connectToPbx(mockServer1 as any);
            await service.connectToPbx(mockServer2 as any);

            const conn1 = service.getConnectionByServerId('server-uuid-001');
            const conn2 = service.getConnectionByServerId('server-uuid-002');

            expect(conn1).toBeDefined();
            expect(conn1!.getServerId()).toBe('server-uuid-001');
            expect(conn2).toBeDefined();
            expect(conn2!.getServerId()).toBe('server-uuid-002');
        });
    });

    // ─── getServerStatus ────────────────────────────────────────────────

    describe('getServerStatus', () => {
        it('should return { online: true } when connection is online', async () => {
            mockIsOnline.mockReturnValue(true);
            await service.connectToPbx(mockServer1 as any);

            const status = service.getServerStatus('server-uuid-001');
            expect(status).toEqual({ online: true });
        });

        it('should return { online: false } when connection is offline', async () => {
            mockIsOnline.mockReturnValue(false);
            await service.connectToPbx(mockServer1 as any);

            const status = service.getServerStatus('server-uuid-001');
            expect(status).toEqual({ online: false });
        });

        it('should return { online: false } when no connection found', () => {
            const status = service.getServerStatus('nonexistent');
            expect(status).toEqual({ online: false });
        });
    });

    // ─── getActiveSessionsCount ─────────────────────────────────────────

    describe('getActiveSessionsCount', () => {
        it('should return 0 (current implementation)', () => {
            expect(service.getActiveSessionsCount()).toBe(0);
        });

        it('should return 0 even with active connections', async () => {
            await service.connectToPbx(mockServer1 as any);

            expect(service.getActiveSessionsCount()).toBe(0);
        });
    });
});
