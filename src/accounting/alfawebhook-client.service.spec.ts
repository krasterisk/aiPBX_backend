import { createHmac } from 'crypto';
import { of } from 'rxjs';
import { AlfawebhookClient } from './alfawebhook-client.service';

describe('aiPBX separate signed binding registration', () => {
    const env = { ...process.env };
    let http: any;
    let service: AlfawebhookClient;
    beforeEach(() => {
        process.env.ALFAWEBHOOK_BASE_URL = 'https://bank.example/';
        process.env.AIPBX_REGISTRATION_SECRET = 'shared-test';
        http = { post: jest.fn().mockReturnValue(of({ data: { ok: true }, status: 201 })) };
        service = new AlfawebhookClient(http);
    });
    afterEach(() => { process.env = { ...env }; });
    it('registers INN and actual userId with personal account using a full-payload HMAC', async () => {
        await service.ensureClientRegistered({ tin: '1234567890' } as any, '42', 'subject', 'AIPBX-60044440');
        const [url, body, options] = http.post.mock.calls[0];
        expect(url).toBe('https://bank.example/api/aipbx/clients');
        expect(body).toEqual({ inn: '1234567890', userId: '42', personalAccountNumber: 'AIPBX-60044440' });
        const timestamp = options.headers['x-aipbx-timestamp'];
        const message = [timestamp, body.inn, body.userId, body.personalAccountNumber].join('\n');
        expect(options.headers['x-aipbx-signature']).toBe(createHmac('sha256', 'shared-test').update(message).digest('hex'));
        expect(options.maxRedirects).toBe(0);
    });
    it('sends an updated userId for an existing INN through the upsert endpoint', async () => {
        for (const id of ['42', '43']) await service.ensureClientRegistered({ tin: '1234567890' } as any, id, 'subject');
        expect(http.post.mock.calls[1][1]).toEqual({ inn: '1234567890', userId: '43', personalAccountNumber: undefined });
    });
    it('does not claim success without explicit acknowledgement', async () => {
        http.post.mockReturnValue(of({ data: {}, status: 200 }));
        await expect(service.ensureClientRegistered({ tin: '1234567890' } as any, '42', 'subject')).rejects.toThrow('not acknowledged');
    });
    it('preserves legacy registration when the new integration is not configured', async () => {
        delete process.env.AIPBX_REGISTRATION_SECRET;
        await service.ensureClientRegistered({ id: 3, tin: '1234567890' } as any, '42', 'subject');
        expect(http.post.mock.calls[0][0]).toBe('https://bank.example/api/clients');
    });
});
