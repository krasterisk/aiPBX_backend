import { Test, TestingModule } from '@nestjs/testing';
import { AlfawebhookClient } from '../accounting/alfawebhook-client.service';
import { HelpdeskAlfawebhookService } from './helpdesk-alfawebhook.service';

describe('HelpdeskAlfawebhookService', () => {
    let service: HelpdeskAlfawebhookService;
    const alfawebhookClient = {
        searchClients: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                HelpdeskAlfawebhookService,
                { provide: AlfawebhookClient, useValue: alfawebhookClient },
            ],
        }).compile();

        service = module.get(HelpdeskAlfawebhookService);
        jest.clearAllMocks();
    });

    it('identifyClient: сначала ищет по телефону (D-01)', async () => {
        alfawebhookClient.searchClients.mockResolvedValueOnce([
            { id: '1', name: 'ООО Тест', inn: '7701234567', pbxUrl: 'https://pbx.example' },
        ]);

        const result = await service.identifyClient({ phone: '+79001234567', inn: '7701234567' });

        expect(alfawebhookClient.searchClients).toHaveBeenCalledTimes(1);
        expect(alfawebhookClient.searchClients).toHaveBeenCalledWith({ phone: '+79001234567' });
        expect(result.found).toBe(true);
        expect(result.isCloud).toBe(true);
    });

    it('identifyClient: при отсутствии по телефону ищет по ИНН', async () => {
        alfawebhookClient.searchClients
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ id: '2', name: 'ИП Иванов', inn: '123456789012' }]);

        const result = await service.identifyClient({ phone: '+79000000000', inn: '123456789012' });

        expect(alfawebhookClient.searchClients).toHaveBeenNthCalledWith(1, { phone: '+79000000000' });
        expect(alfawebhookClient.searchClients).toHaveBeenNthCalledWith(2, { inn: '123456789012' });
        expect(result.found).toBe(true);
    });

    it('identifyClient: несколько совпадений по названию — до 3 кандидатов (D-02)', async () => {
        alfawebhookClient.searchClients.mockResolvedValueOnce([
            { name: 'A' },
            { name: 'B' },
            { name: 'C' },
            { name: 'D' },
        ]);

        const result = await service.identifyClient({ name: 'ООО' });

        expect(alfawebhookClient.searchClients).toHaveBeenCalledWith({ name: 'ООО' });
        expect(result.found).toBe(false);
        expect(result.candidates).toHaveLength(3);
    });
});
