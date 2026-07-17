import { HttpException, HttpStatus } from '@nestjs/common';
import { OrganizationDocumentsService } from './organization-documents.service';

describe('OrganizationDocumentsService.updateDocument', () => {
    const org = { id: 7, userId: 42 };
    const docId = '11111111-1111-4111-8111-111111111111';

    function createService(overrides?: {
        findOneResult?: any;
        isAdmin?: boolean;
    }) {
        const doc = overrides?.findOneResult ?? {
            id: docId,
            number: 'AI-1',
            documentDate: '2026-01-01',
            amountRub: '100.00',
            update: jest.fn().mockImplementation(async (patch) => {
                Object.assign(doc, patch);
            }),
            get: jest.fn().mockImplementation(() => ({
                id: doc.id,
                number: doc.number,
                documentDate: doc.documentDate,
                amountRub: doc.amountRub,
            })),
        };

        const docModel = {
            findOne: jest.fn().mockResolvedValue(doc),
        };
        const orgModel = {
            findByPk: jest.fn().mockResolvedValue(org),
        };
        const userModel = {
            findByPk: jest.fn(),
        };
        const sbis = {} as any;

        const service = new OrganizationDocumentsService(
            docModel as any,
            orgModel as any,
            userModel as any,
            sbis,
        );

        return { service, doc, docModel };
    }

    it('updates number, date and amount in DB only', async () => {
        const { service, doc } = createService();

        const result = await service.updateDocument(1, 7, docId, true, {
            number: ' AI-99 ',
            documentDate: '2026-07-16',
            amountRub: 1234.5,
        });

        expect(doc.update).toHaveBeenCalledWith({
            number: 'AI-99',
            documentDate: '2026-07-16',
            amountRub: '1234.50',
        });
        expect(result.number).toBe('AI-99');
        expect(result.documentDate).toBe('2026-07-16');
        expect(result.amountRub).toBe('1234.50');
    });

    it('forbids non-admin', async () => {
        const { service } = createService();
        await expect(
            service.updateDocument(1, 7, docId, false, { number: 'X' }),
        ).rejects.toMatchObject({
            status: HttpStatus.FORBIDDEN,
        } as Partial<HttpException>);
    });

    it('rejects empty patch', async () => {
        const { service } = createService();
        await expect(
            service.updateDocument(1, 7, docId, true, {}),
        ).rejects.toMatchObject({
            status: HttpStatus.BAD_REQUEST,
        } as Partial<HttpException>);
    });
});
