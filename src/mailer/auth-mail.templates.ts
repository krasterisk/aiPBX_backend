import {
    billingNoticeParagraph,
    mailAuthCodeBox,
    wrapBillingMailHtml,
} from './billing-mail.layout';

export type AuthMailPurpose = 'login' | 'signup';

export function activationMail(isRu: boolean, code: string, purpose: AuthMailPurpose = 'login') {
    const codeLabel = isRu ? 'Ваш код' : 'Your code';
    const security = billingNoticeParagraph(
        isRu
            ? 'В целях безопасности код действует ограниченное время. Никому не сообщайте этот код.'
            : 'For your security, this code expires in a few minutes. Do not share it with anyone.',
        'info',
    );

    if (isRu) {
        const intro =
            purpose === 'signup'
                ? 'Здравствуйте!<br/><br/>Для завершения регистрации в AI PBX введите код ниже.'
                : 'Здравствуйте!<br/><br/>Для входа в AI PBX введите код ниже.';
        return {
            subject: `Код авторизации: ${code}`,
            html: wrapBillingMailHtml({
                isRu: true,
                title: 'Код авторизации',
                intro,
                bodyHtml: `${mailAuthCodeBox(code, codeLabel)}${security}`,
                showCta: false,
            }),
        };
    }

    const intro =
        purpose === 'signup'
            ? 'Hello,<br/><br/>Enter the code below to complete your AI PBX registration.'
            : 'Hello,<br/><br/>Enter the code below to sign in to AI PBX.';
    return {
        subject: `Auth code: ${code}`,
        html: wrapBillingMailHtml({
            isRu: false,
            title: 'Authorization code',
            intro,
            bodyHtml: `${mailAuthCodeBox(code, codeLabel)}${security}`,
            showCta: false,
        }),
    };
}

export function resetPasswordMail(isRu: boolean, resetUrl: string) {
    const warning = billingNoticeParagraph(
        isRu
            ? 'Если вы не запрашивали сброс пароля, проигнорируйте это письмо и не переходите по ссылке.'
            : 'If you did not request a password reset, ignore this email and do not use the link.',
        'warning',
    );

    if (isRu) {
        return {
            subject: 'AI PBX — сброс пароля',
            html: wrapBillingMailHtml({
                isRu: true,
                title: 'Сброс пароля',
                intro:
                    'Здравствуйте!<br/><br/>Для вашей учётной записи запрошен сброс пароля. Нажмите кнопку ниже, чтобы задать новый пароль.',
                bodyHtml: warning,
                cta: {
                    href: resetUrl,
                    label: 'Сбросить пароль',
                    hint: 'Ссылка действует ограниченное время.',
                    showUrl: true,
                },
            }),
        };
    }

    return {
        subject: 'AI PBX — password reset',
        html: wrapBillingMailHtml({
            isRu: false,
            title: 'Password reset',
            intro:
                'Hello,<br/><br/>A password reset was requested for your account. Use the button below to set a new password.',
            bodyHtml: warning,
            cta: {
                href: resetUrl,
                label: 'Reset password',
                hint: 'This link expires after a limited time.',
                showUrl: true,
            },
        }),
    };
}
