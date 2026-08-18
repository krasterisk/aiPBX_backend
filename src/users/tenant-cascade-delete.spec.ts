import { Op } from 'sequelize';
import { cascadeDeleteTenantData } from './tenant-cascade-delete';

describe('cascadeDeleteTenantData', () => {
    function makeModel(overrides: Partial<{ findAll: jest.Mock; destroy: jest.Mock; update: jest.Mock }> = {}) {
        return {
            findAll: jest.fn().mockResolvedValue([]),
            destroy: jest.fn().mockResolvedValue(0),
            update: jest.fn().mockResolvedValue([0]),
            ...overrides,
        };
    }

    it('deletes member-scoped and owner-scoped rows', async () => {
        const assistant = makeModel({ findAll: jest.fn().mockResolvedValue([{ id: 7 }]) });
        const widgetKey = makeModel({ findAll: jest.fn().mockResolvedValue([{ id: 3 }]) });
        const widgetSession = makeModel();
        const organization = makeModel();
        const billing = makeModel();
        const userRoles = makeModel();
        const helpdesk = makeModel();

        const sequelize = {
            models: {
                Assistant: assistant,
                WidgetKey: widgetKey,
                WidgetSession: widgetSession,
                Organization: organization,
                BillingRecord: billing,
                UserRoles: userRoles,
                HelpdeskTicket: helpdesk,
            },
        } as any;

        const transaction = {} as any;
        await cascadeDeleteTenantData(
            sequelize,
            { ownerId: 1, memberIds: [1, 10], deleteOwnerScoped: true },
            transaction,
        );

        expect(widgetSession.destroy).toHaveBeenCalledWith({
            where: { widgetKeyId: { [Op.in]: [3] } },
            transaction,
        });
        expect(assistant.destroy).toHaveBeenCalledWith({
            where: { id: { [Op.in]: [7] } },
            transaction,
        });
        expect(organization.destroy).toHaveBeenCalledWith({
            where: { userId: 1 },
            transaction,
        });
        expect(billing.destroy).toHaveBeenCalledWith({
            where: { userId: '1' },
            transaction,
        });
        expect(userRoles.destroy).toHaveBeenCalledWith({
            where: { userId: { [Op.in]: [1, 10, '1', '10'] } },
            transaction,
        });
        expect(helpdesk.update).toHaveBeenCalledWith(
            { assigneeId: null },
            { where: { assigneeId: { [Op.in]: [1, 10] } }, transaction },
        );
    });

    it('skips owner-scoped tables when deleting a sub-user only', async () => {
        const organization = makeModel();
        const sequelize = {
            models: {
                Organization: organization,
                Assistant: makeModel(),
                WidgetKey: makeModel(),
                UserRoles: makeModel(),
            },
        } as any;

        await cascadeDeleteTenantData(
            sequelize,
            { ownerId: 1, memberIds: [10], deleteOwnerScoped: false },
            {} as any,
        );

        expect(organization.destroy).not.toHaveBeenCalled();
    });
});
