import { Injectable, Logger } from '@nestjs/common';
import TelegramBot, { SendMessageOptions } from 'node-telegram-bot-api';

/**
 * Predefined Telegram tools for AI assistant integration.
 * These are registered as MCP tools and called by the ToolGatewayService.
 */
export const TELEGRAM_TOOLS: Array<{
  slug: string;
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}> = [
    // ─── Messages ────────────────────────────────────────────────────
    {
      slug: 'TELEGRAM_SEND_MESSAGE',
      name: 'Send Message',
      description: 'Send a text message to the user\'s Telegram chat. Supports HTML formatting. Use to send confirmations, summaries, appointment details, or any text information.',
      inputSchema: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Message text. Supports HTML: <b>bold</b>, <i>italic</i>, <code>code</code>, <a href="url">link</a>',
          },
          parse_mode: {
            type: 'string',
            enum: ['HTML', 'Markdown'],
            description: 'Text formatting mode',
            default: 'HTML',
          },
        },
        required: ['text'],
      },
    },

    // ─── Structured Data (as formatted message) ─────────────────────
    {
      slug: 'TELEGRAM_SEND_DATA',
      name: 'Send Structured Data',
      description: 'Send structured data (appointment details, order info, contact card, etc.) as a formatted Telegram message. Pass any key-value pairs and they will be formatted as a readable message.',
      inputSchema: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Message title/header (e.g. "Запись на приём", "Новый заказ")',
          },
          data: {
            type: 'object',
            description: 'Key-value pairs to send. Example: { "Имя": "Иван", "Дата": "2026-03-01", "Время": "14:00", "Врач": "Терапевт" }',
            additionalProperties: { type: 'string' },
          },
          footer: {
            type: 'string',
            description: 'Optional footer text (e.g. "Для отмены позвоните по телефону...")',
          },
        },
        required: ['title', 'data'],
      },
    },

    // ─── Contact Card ────────────────────────────────────────────────
    {
      slug: 'TELEGRAM_SEND_CONTACT',
      name: 'Send Contact',
      description: 'Send a contact card to Telegram with phone and name.',
      inputSchema: {
        type: 'object',
        properties: {
          phone_number: { type: 'string', description: 'Contact phone number' },
          first_name: { type: 'string', description: 'Contact first name' },
          last_name: { type: 'string', description: 'Contact last name' },
        },
        required: ['phone_number', 'first_name'],
      },
    },

    // ─── Location ───────────────────────────────────────────────────
    {
      slug: 'TELEGRAM_SEND_LOCATION',
      name: 'Send Location',
      description: 'Send a geographic location (map pin) to Telegram.',
      inputSchema: {
        type: 'object',
        properties: {
          latitude: { type: 'number', description: 'Latitude' },
          longitude: { type: 'number', description: 'Longitude' },
        },
        required: ['latitude', 'longitude'],
      },
    },

    // ─── Message with Inline Buttons ─────────────────────────────────
    {
      slug: 'TELEGRAM_SEND_BUTTONS',
      name: 'Send Message with Buttons',
      description: 'Send a message with inline URL buttons. Useful for sending links to booking pages, payment forms, etc.',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Message text' },
          buttons: {
            type: 'array',
            description: 'Array of buttons. Each button has text and url.',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string', description: 'Button label' },
                url: { type: 'string', description: 'Button URL' },
              },
              required: ['text', 'url'],
            },
          },
        },
        required: ['text', 'buttons'],
      },
    },
  ];

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

  // ─── Configuration Check ────────────────────────────────────────

  /**
   * Check if Telegram bot is configured.
   */
  isConfigured(): boolean {
    return !!process.env.TELEGRAM_BOT_TOKEN;
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

  // ─── AI Tool Integration ────────────────────────────────────────

  /**
   * Return the list of available Telegram tools for AI assistant registration.
   */
  getAvailableTools() {
    return TELEGRAM_TOOLS.map((tool) => ({
      slug: tool.slug,
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  /**
   * Execute a Telegram tool called by the AI assistant.
   *
   * @param chatId   - Target Telegram chat ID
   * @param toolSlug - Tool slug (e.g. TELEGRAM_SEND_MESSAGE)
   * @param args     - Arguments from OpenAI function call
   */
  async executeAction(
    chatId: string,
    toolSlug: string,
    args: Record<string, any>,
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Telegram Bot is not configured. TELEGRAM_BOT_TOKEN is missing.');
    }

    const tool = TELEGRAM_TOOLS.find((t) => t.slug === toolSlug);
    if (!tool) {
      throw new Error(`Unknown Telegram tool: ${toolSlug}`);
    }

    try {
      switch (toolSlug) {
        case 'TELEGRAM_SEND_DATA': {
          const text = this.formatStructuredData(args.title, args.data, args.footer);
          await this.sendMessage(text, { parse_mode: 'HTML' }, chatId);
          break;
        }

        case 'TELEGRAM_SEND_BUTTONS': {
          const replyMarkup = {
            inline_keyboard: (args.buttons || []).map((btn: any) => [
              { text: btn.text, url: btn.url },
            ]),
          };
          await this.bot.sendMessage(chatId, args.text, {
            parse_mode: 'HTML',
            reply_markup: replyMarkup,
          });
          break;
        }

        case 'TELEGRAM_SEND_MESSAGE': {
          const parseMode = args.parse_mode || 'HTML';
          await this.sendMessage(args.text, { parse_mode: parseMode as any }, chatId);
          break;
        }

        case 'TELEGRAM_SEND_CONTACT': {
          await this.bot.sendContact(chatId, args.phone_number, args.first_name, {
            last_name: args.last_name,
          } as any);
          break;
        }

        case 'TELEGRAM_SEND_LOCATION': {
          await this.bot.sendLocation(chatId, args.latitude, args.longitude);
          break;
        }

        default:
          throw new Error(`Unhandled Telegram tool: ${toolSlug}`);
      }

      this.logger.log(`Telegram tool ${toolSlug} executed → chat ${chatId}`);
      return JSON.stringify({
        success: true,
        description: `Message sent successfully to chat ${chatId}`,
      });
    } catch (error) {
      this.logger.error(`Telegram tool ${toolSlug} failed: ${error.message}`);
      throw new Error(`Telegram API error: ${error.message}`);
    }
  }

  // ─── Send Message (shared utility) ──────────────────────────────

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

  // ─── Validate Chat ID ───────────────────────────────────────────

  /**
   * Validate a chat ID by calling getChat.
   */
  async validateChatId(chatId: string): Promise<boolean> {
    try {
      await this.bot.getChat(chatId);
      return true;
    } catch {
      return false;
    }
  }

  // ─── Formatting Helpers ─────────────────────────────────────────

  /**
   * Format structured key-value data as an HTML Telegram message.
   */
  private formatStructuredData(
    title: string,
    data: Record<string, any>,
    footer?: string,
  ): string {
    const lines: string[] = [];

    lines.push(`<b>📋 ${this.escapeHtml(title)}</b>`);
    lines.push('');

    for (const [key, value] of Object.entries(data || {})) {
      lines.push(`▪️ <b>${this.escapeHtml(key)}:</b> ${this.escapeHtml(String(value))}`);
    }

    if (footer) {
      lines.push('');
      lines.push(`<i>${this.escapeHtml(footer)}</i>`);
    }

    return lines.join('\n');
  }

  /**
   * Escape HTML special characters for Telegram HTML mode.
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
