import { BadRequestException } from '@nestjs/common';
import { OperatorAnalyticsController } from './operator-analytics.controller';
import { parseCallType } from './lib/call-type';

describe('Call type ingestion', () => {
    let controller: OperatorAnalyticsController;
    const createService = () => ({
        createProcessingRecord: jest.fn().mockResolvedValue({ id: 42, update: jest.fn() }),
        analyzeFile: jest.fn().mockResolvedValue({ id: 42 }),
        analyzeUrl: jest.fn().mockResolvedValue({ id: 42 }),
        startBatch: jest.fn(), processUrlInBackground: jest.fn(),
    });
    let service: ReturnType<typeof createService>;
    const req = { tokenUserId: 'owner', apiToken: { projectId: 7 } } as unknown as Parameters<OperatorAnalyticsController['uploadFromApi']>[1];
    const file = { buffer: Buffer.from('audio'), originalname: 'call.mp3', mimetype: 'audio/mpeg', size: 5 };

    beforeEach(() => {
        service = createService();
        controller = new OperatorAnalyticsController(
            service as unknown as ConstructorParameters<typeof OperatorAnalyticsController>[0],
            {} as ConstructorParameters<typeof OperatorAnalyticsController>[1],
            {} as ConstructorParameters<typeof OperatorAnalyticsController>[2],
        );
    });

    it.each([undefined, null, 'incoming', 'outgoing', 'internal'])('parses %s', value => {
        expect(parseCallType(value)).toBe(value ?? 'incoming');
    });

    it.each(['', 'inbound', 'OUTGOING', 1, {}, []])('rejects invalid value %s', value => {
        expect(() => parseCallType(value)).toThrow(BadRequestException);
    });

    it('defaults multipart upload to incoming', async () => {
        await controller.uploadFromApi([file], req, {});
        expect(service.createProcessingRecord).toHaveBeenCalledWith('call.mp3', 'owner', 'api', expect.objectContaining({ callType: 'incoming', projectId: 7 }));
    });

    it('passes outgoing through synchronous multipart', async () => {
        await controller.uploadFromApi([file], req, { callType: 'outgoing', sync: 'true' });
        expect(service.analyzeFile).toHaveBeenCalledWith(file.buffer, 'call.mp3', 'owner', 'api', expect.objectContaining({ callType: 'outgoing' }));
    });

    it('passes outgoing through frontend batch', async () => {
        await controller.uploadFromFrontend([file, file], req, { callType: 'outgoing' });
        expect(service.createProcessingRecord).toHaveBeenCalledTimes(2);
        expect(service.createProcessingRecord.mock.calls.every(args => args[3].callType === 'outgoing')).toBe(true);
    });

    it('passes outgoing through synchronous unified URL', async () => {
        await controller.analyzeUnified(req, { url: 'https://example.com/call.mp3', callType: 'outgoing', sync: true });
        expect(service.analyzeUrl).toHaveBeenCalledWith('https://example.com/call.mp3', 'owner', expect.objectContaining({ callType: 'outgoing' }));
    });

    it('passes outgoing through async legacy URLs', async () => {
        await controller.analyzeFromUrl(req, { urls: ['https://example.com/1.mp3', 'https://example.com/2.mp3'], callType: 'outgoing' });
        expect(service.createProcessingRecord).toHaveBeenCalledTimes(2);
        expect(service.createProcessingRecord.mock.calls.every(args => args[3].callType === 'outgoing')).toBe(true);
    });

    it('passes outgoing through unified Base64 batch', async () => {
        await controller.analyzeUnified(req, { files: [{ data: file.buffer.toString('base64'), filename: 'call.mp3' }], callType: 'outgoing' });
        expect(service.createProcessingRecord).toHaveBeenCalledWith('call.mp3', 'owner', 'api', expect.objectContaining({ callType: 'outgoing' }));
    });

    it('passes internal through synchronous Base64', async () => {
        await controller.analyzeUnified(req, { file: file.buffer.toString('base64'), filename: 'call.mp3', callType: 'internal', sync: true });
        expect(service.analyzeFile).toHaveBeenCalledWith(file.buffer, 'call.mp3', 'owner', 'api', expect.objectContaining({ callType: 'internal' }));
    });

    it('rejects invalid multipart before creating records', async () => {
        await expect(controller.uploadFromApi([file], req, { callType: 'bad' as never })).rejects.toThrow(BadRequestException);
        expect(service.createProcessingRecord).not.toHaveBeenCalled();
        expect(service.analyzeFile).not.toHaveBeenCalled();
    });
});
