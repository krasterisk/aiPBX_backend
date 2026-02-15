import { Injectable, Logger } from '@nestjs/common';
import TelegramBot, { SendMessageOptions } from 'node-telegram-bot-api';

@Injectable()
export class TelegramService {
  private bot: TelegramBot;
  private readonly logger = new Logger(TelegramService.name);
  private readonly adminChatId = process.env.TELEGRAM_ADMIN_CHATID;

  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const baseApiUrl = 'https://api.telegram.org';
    this.bot = new TelegramBot(token, { polling: false, baseApiUrl });
  }

  // ─── Webhook Update Handler ──────────────────────────────────────

  /**
   * Process incoming Telegram update from webhook.
   */
  async handleUpdate(update: any): Promise<void> {
    const message = update?.message;
    if (!message) return;

    const chatId = message.chat?.id;
    const text = message.text?.trim();

    if (!chatId || !text) return;

    this.logger.log(`Message from chat ${chatId}: ${text}`);

    // Command routing
    if (text === '/start') {
      await this.handleStart(chatId, message);
    }
  }

  // ─── Command Handlers ────────────────────────────────────────────

  /**
   * Handle /start command:
   * - Send welcome message
   * - Send the user's chatId so they can use it for integration
   */
  private async handleStart(chatId: number, message: any): Promise<void> {
    const firstName = message.from?.first_name || 'there';

    const welcomeText =
      `👋 Hi, ${firstName}!\n\n` +
      `I'm the aiPBX bot. Your AI assistant will use me to send you notifications.\n\n` +
      `📋 *Your Chat ID:*\n` +
      `\`${chatId}\`\n\n` +
      `Copy this ID and paste it when connecting Telegram in your aiPBX settings.`;

    await this.sendMessage(welcomeText, { parse_mode: 'Markdown' }, chatId);

    this.logger.log(`/start handled for user ${firstName}, chatId: ${chatId}`);
  }

  // ─── Send Message ────────────────────────────────────────────────

  async sendMessage(
    message: string,
    options?: SendMessageOptions,
    chatId?: string | number,
  ): Promise<void> {
    const targetChatId = chatId ?? this.adminChatId;

    if (!targetChatId) {
      this.logger.warn('Error send message to telegram. No chatId provided');
      return;
    }

    try {
      await this.bot.sendMessage(targetChatId, message, options);
    } catch (error) {
      this.logger.warn(
        `Error send message to telegram: ${error?.response?.body?.description || error.message}`,
      );
    }
  }
}
