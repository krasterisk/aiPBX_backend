import { UsersService } from './users.service';

describe('committed balance credit notification', () => {
    const env = { ...process.env };
    let service: UsersService, deps: any, credit: any;
    beforeEach(() => {
        delete process.env.BALANCE_CREDIT_EMAIL_ENABLED;
        process.env.TENANT_CURRENCY = 'RUB';
        credit = { id: 7, direction: 'credit', userId: '99', amountUsd: '50', balanceAfterUsd: '60', paymentId: '1',
            meta: {}, update: jest.fn(), getDataValue: () => new Date('2026-10-29T03:29:10Z') };
        const owner: any = { id: 99, vpbx_user_id: null, balance: 10, username: 'login', email: ' Owner@Example.com ', currency: 'USD',
            personalAccountNumber: 'AIPBX-12345678', update: jest.fn() };
        deps = {
            usersRepository: { findByPk: jest.fn().mockResolvedValue(owner), findAll: jest.fn().mockResolvedValue([{ email: 'manager@example.com' }]) },
            organizationsRepository: { findOne: jest.fn().mockResolvedValue({ name: 'Customer organization' }) },
            balanceLedgerRepository: { findByPk: jest.fn().mockResolvedValue(credit), create: jest.fn().mockResolvedValue(credit), findOne: jest.fn().mockResolvedValue(null) },
            paymentsRepository: { findByPk: jest.fn().mockResolvedValue({ amountRub: '5000', fxRateRubUsd: 100 }) },
            balanceThresholdAlertsService: { listForOwner: jest.fn().mockResolvedValue([{ emails: ['owner@example.com', 'Billing@Example.com'] }]) },
            mailerService: { sendBalanceCreditNotification: jest.fn().mockResolvedValue({ status: 'sent' }) },
            logger: { warn: jest.fn() },
        };
        service = Object.assign(Object.create(UsersService.prototype), deps);
    });
    afterEach(() => { process.env = { ...env }; });
    it('uses the same owner, alert and manager recipients, normalized and deduplicated', async () => {
        const result = await service.getBalanceCreditEmailData(7);
        expect(result.recipients).toEqual(['owner@example.com', 'billing@example.com', 'manager@example.com']);
        expect(result.currency).toBe('RUB'); expect(result.rate).toBe(100);
        expect(result.params.clientName).toBe('Customer organization');
        expect(result.params.originalAmount).toBe(5000);
    });
    it('keeps customer sending disabled until approval', async () => {
        expect(await service.sendBalanceCreditEmail(7)).toEqual({ status: 'disabled' });
        expect(deps.balanceLedgerRepository.findByPk).not.toHaveBeenCalled();
        expect(deps.mailerService.sendBalanceCreditNotification).not.toHaveBeenCalled();
    });
    it('sends after approval and records completion without changing balance', async () => {
        process.env.BALANCE_CREDIT_EMAIL_ENABLED = 'true';
        await service.sendBalanceCreditEmail(7);
        expect(deps.mailerService.sendBalanceCreditNotification).toHaveBeenCalledTimes(1);
        expect(credit.update).toHaveBeenCalledWith({ meta: { balanceCreditEmailSentAt: expect.any(String) } });
    });
    it('does not resend a completed credit email', async () => {
        process.env.BALANCE_CREDIT_EMAIL_ENABLED = 'true'; credit.meta.balanceCreditEmailSentAt = 'sent';
        expect(await service.sendBalanceCreditEmail(7)).toEqual({ status: 'already_sent' });
        expect(deps.mailerService.sendBalanceCreditNotification).not.toHaveBeenCalled();
    });
    it('registers customer mail only after commit, not while the balance is being written', async () => {
        process.env.BALANCE_CREDIT_EMAIL_ENABLED = 'true';
        const transaction = { LOCK: { UPDATE: 'UPDATE' }, afterCommit: jest.fn() };
        const send = jest.spyOn(service, 'sendBalanceCreditEmail').mockResolvedValue({ status: 'sent' });
        await service.updateUserBalance('99', 50, { transaction: transaction as any });
        expect(send).not.toHaveBeenCalled(); expect(transaction.afterCommit).toHaveBeenCalledTimes(1);
        await transaction.afterCommit.mock.calls[0][0](); expect(send).toHaveBeenCalledWith(7);
    });
    it('does not register another notification for an already credited transaction', async () => {
        process.env.BALANCE_CREDIT_EMAIL_ENABLED = 'true';
        deps.balanceLedgerRepository.findOne.mockResolvedValue(credit);
        const transaction = { LOCK: { UPDATE: 'UPDATE' }, afterCommit: jest.fn() };
        await service.updateUserBalance('99', 50, { transaction: transaction as any, externalId: 'bank-id' });
        expect(transaction.afterCommit).not.toHaveBeenCalled();
    });
});
