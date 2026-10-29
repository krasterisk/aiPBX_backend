import { createHmac } from 'crypto';
import { Sequelize } from 'sequelize-typescript';
import { CurrencyHistory } from '../accounting/currency-history.model';
import { PaymentsService } from './payments.service';

jest.mock('../users/users.service', () => ({ UsersService: class {} }));
jest.mock('../telegram/telegram.service', () => ({ TelegramService: class {} }));
jest.mock('../currency/currency.service', () => ({ CurrencyService: class {} }));
jest.mock('../logger/logger.service', () => ({ LoggerService: class {} }));
jest.mock('../accounting/invoice.service', () => ({ InvoiceService: class {} }));

describe('Alfa callback committed credit acknowledgement', () => {
    let service: PaymentsService;
    let deps: any;
    const body = { InvId: 'bank-test-1', userId: '99', OutSumm: '5000' };
    const header = { 'x-alfa-signature': createHmac('sha256', 'test-secret').update(body.InvId).digest('hex') };
    const credit = { userId: '99', direction: 'credit', amountUsd: '50.0000' };
    const originalAdvance = process.env.BILLING_CREATE_ADVANCE_INVOICE;
    beforeEach(() => {
        delete process.env.BILLING_CREATE_ADVANCE_INVOICE;
        deps = {
            paymentsRepository: { create: jest.fn().mockResolvedValue({ id: 7 }) },
            currencyHistoryRepository: { bulkCreate: jest.fn().mockResolvedValue([]) },
            balanceLedgerRepository: { findOne: jest.fn().mockResolvedValueOnce(null).mockResolvedValue(credit) },
            sequelize: { transaction: jest.fn(async (_options, callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })) },
            usersService: { resolveOwnerId: jest.fn().mockResolvedValue(99), updateUserBalance: jest.fn().mockResolvedValue(true) },
            configService: { get: jest.fn().mockReturnValue('test-secret') },
            currencyService: { convertToUsd: jest.fn().mockResolvedValue(50) },
            telegramService: { sendMessage: jest.fn() }, logService: { logAction: jest.fn() },
            invoiceService: { createAdvanceAfterBankPayment: jest.fn() }, logger: { warn: jest.fn() },
        };
        service = Object.assign(Object.create(PaymentsService.prototype), deps);
    });
    afterEach(() => {
        if (originalAdvance == null) delete process.env.BILLING_CREATE_ADVANCE_INVOICE;
        else process.env.BILLING_CREATE_ADVANCE_INVOICE = originalAdvance;
    });
    it('acknowledges only after verifying ledger credit outside the transaction', async () => {
        await expect(service.handleAlfaBankCallback(body, header)).resolves.toEqual({ ok: true });
        expect(deps.currencyHistoryRepository.bulkCreate).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ ignoreDuplicates: true }));
        expect(deps.balanceLedgerRepository.findOne).toHaveBeenLastCalledWith({ where: { source: 'alfa_bank', externalId: body.InvId } });
        expect(deps.telegramService.sendMessage).toHaveBeenCalledTimes(1);
    });
    it('propagates an FX database error without acknowledgement or success notification', async () => {
        deps.currencyHistoryRepository.bulkCreate.mockRejectedValue(new Error('column missing'));
        await expect(service.handleAlfaBankCallback(body, header)).rejects.toThrow('column missing');
        expect(deps.telegramService.sendMessage).not.toHaveBeenCalled();
    });
    it('rejects a silently rolled back transaction', async () => {
        deps.balanceLedgerRepository.findOne.mockReset().mockResolvedValue(null);
        await expect(service.handleAlfaBankCallback(body, header)).rejects.toThrow('not persisted');
        expect(deps.telegramService.sendMessage).not.toHaveBeenCalled();
    });
    it('rejects a false balance update result', async () => {
        deps.usersService.updateUserBalance.mockResolvedValue(false);
        await expect(service.handleAlfaBankCallback(body, header)).rejects.toThrow('credit failed');
    });
    it('acknowledges a duplicate without crediting or notifying again', async () => {
        deps.balanceLedgerRepository.findOne.mockReset().mockResolvedValue(credit);
        await expect(service.handleAlfaBankCallback(body, header)).resolves.toEqual({ ok: true });
        expect(deps.usersService.updateUserBalance).not.toHaveBeenCalled();
        expect(deps.telegramService.sendMessage).not.toHaveBeenCalled();
    });
    it('rejects replay with a different tenant', async () => {
        deps.balanceLedgerRepository.findOne.mockReset().mockResolvedValue({ ...credit, userId: '100' });
        await expect(service.handleAlfaBankCallback(body, header)).rejects.toThrow('Conflicting');
    });
    it('isolates optional advance document failure with a savepoint', async () => {
        process.env.BILLING_CREATE_ADVANCE_INVOICE = 'true';
        deps.invoiceService.createAdvanceAfterBankPayment.mockRejectedValue(new Error('document failed'));
        await expect(service.handleAlfaBankCallback(body, header)).resolves.toEqual({ ok: true });
        expect(deps.sequelize.transaction).toHaveBeenCalledTimes(2);
        expect(deps.sequelize.transaction.mock.calls[1][0].transaction).toBeDefined();
    });
    it('requires a valid callback signature', async () => {
        await expect(service.handleAlfaBankCallback(body, {})).rejects.toThrow('signature');
        expect(deps.sequelize.transaction).not.toHaveBeenCalled();
    });
    it('maps the actual currency_history schema without updatedAt', async () => {
        const db = new Sequelize({ dialect: 'postgres', logging: false, models: [CurrencyHistory] });
        expect(CurrencyHistory.getAttributes().updatedAt).toBeUndefined();
        await db.close();
    });
});
