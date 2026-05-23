import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { ClosingTask } from './closing.task';
import { OrganizationDocument } from './organization-document.model';
import { SbisService } from './sbis.service';
import { ClosingService } from './closing.service';

describe('ClosingTask', () => {
    let task: ClosingTask;
    let closingService: { runMonthlyClosing: jest.Mock };

    beforeEach(async () => {
        closingService = { runMonthlyClosing: jest.fn().mockResolvedValue(undefined) };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ClosingTask,
                { provide: getModelToken(OrganizationDocument), useValue: { findAll: jest.fn() } },
                { provide: SbisService, useValue: { enqueueDocument: jest.fn() } },
                { provide: ClosingService, useValue: closingService },
            ],
        }).compile();

        task = module.get(ClosingTask);
    });

    it('monthlyClosingDocuments delegates to ClosingService', async () => {
        await task.monthlyClosingDocuments();
        expect(closingService.runMonthlyClosing).toHaveBeenCalled();
    });
});
