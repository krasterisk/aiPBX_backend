import { HelpdeskLlmContextService } from './helpdesk-llm-context.service';

describe('HelpdeskLlmContextService', () => {
    let service: HelpdeskLlmContextService;

    beforeEach(() => {
        service = new HelpdeskLlmContextService({} as never, {} as never, {} as never);
    });

    it('regenerateMarkdown builds summary from JSON', () => {
        const md = service.regenerateMarkdown({
            clientName: 'ООО Тест',
            inn: '7701234567',
            tickets: [{ id: 1, status: 'new', subject: 'Проблема с SIP', category: 'tech', priority: 'high' }],
            recentMessages: [{ role: 'user', ticketId: 1, content: 'Не работает телефон' }],
        });

        expect(md).toContain('ООО Тест');
        expect(md).toContain('7701234567');
        expect(md).toContain('#1');
        expect(md).toContain('Проблема с SIP');
        expect(md).toContain('Не работает телефон');
    });
});
