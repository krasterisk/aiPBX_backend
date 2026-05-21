import { activationMail, resetPasswordMail } from './auth-mail.templates';

describe('auth-mail templates', () => {
    it('activationMail (login) uses shared layout with logo and no payment CTA', () => {
        const { html, subject } = activationMail(true, '123456', 'login');
        expect(subject).toBe('Код авторизации: 123456');
        expect(html).toContain('cid:aipbx-logo');
        expect(html).toContain('123456');
        expect(html).toContain('Для входа в AI PBX');
        expect(html).not.toContain('Перейти к оплате');
    });

    it('activationMail (signup) uses registration intro', () => {
        const { html } = activationMail(false, '654321', 'signup');
        expect(html).toContain('complete your AI PBX registration');
        expect(html).not.toContain('Go to payment');
    });

    it('resetPasswordMail includes reset CTA button', () => {
        const url = 'https://api.example.com/reset/abc';
        const { html } = resetPasswordMail(true, url);
        expect(html).toContain('Сбросить пароль');
        expect(html).toContain(url);
        expect(html).toContain('cid:aipbx-logo');
    });
});
