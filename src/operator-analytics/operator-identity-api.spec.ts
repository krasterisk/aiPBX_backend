import { ValidationPipe } from '@nestjs/common';
import { OperatorAnalyticsController } from './operator-analytics.controller';
import { OperatorAnalyticsService } from './operator-analytics.service';
import { OperatorDigestService } from './operator-digest.service';
import { OperatorAlertService } from './operator-alert.service';
import { AnalyzeRequestDto } from './dto/analyze.dto';

describe('backward-compatible operator metadata API', () => {
    const create = jest.fn(async () => ({ id: 7, update: jest.fn() }));
    const background = jest.fn();
    const controller = new OperatorAnalyticsController(
        { createProcessingRecord: create, processUrlInBackground: background } as unknown as OperatorAnalyticsService,
        {} as OperatorDigestService, {} as OperatorAlertService,
    );
    const pipe = new ValidationPipe({ transform: true, whitelist: true });
    const request = { tokenUserId: '99' } as never;
    beforeEach(() => { create.mockClear(); background.mockClear(); });
    async function send(body: unknown) {
        const dto = await pipe.transform(body, { type: 'body', metatype: AnalyzeRequestDto });
        return controller.analyzeUnified(request, dto);
    }
    it('accepts the existing payload without new mandatory properties', async () => {
        expect(await send({ url: 'https://example.invalid/call.mp3', operatorName: 'Anna', language: 'ru' }))
            .toMatchObject({ id: 7, status: 'processing' });
        expect(create).toHaveBeenCalledWith('call.mp3', '99', 'api', expect.objectContaining({ operatorName: 'Anna' }));
    });
    it('passes stable ID and call extension separately through the real DTO/controller', async () => {
        await send({ url: 'https://example.invalid/call.mp3', operatorName: 'Anna', operatorId: 'pbx:7', operatorExtension: '0301' });
        expect(create).toHaveBeenLastCalledWith('call.mp3', '99', 'api', expect.objectContaining({ operatorName: 'Anna', operatorId: 'pbx:7', operatorExtension: '0301' }));
    });
    it('rejects malformed IDs before scheduling processing', async () => {
        await expect(send({ url: 'https://example.invalid/call.mp3', operatorId: 7 })).rejects.toMatchObject({ status: 400 });
        expect(create).not.toHaveBeenCalled();
        expect(background).not.toHaveBeenCalled();
    });
});
