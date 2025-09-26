import {HttpException, HttpStatus, Injectable, Logger} from '@nestjs/common';
import TelegramBot, { SendMessageOptions } from 'node-telegram-bot-api';

@Injectable()
export class TelegramService {
  private bot: TelegramBot;
  private readonly logger = new Logger(TelegramService.name);
  private readonly adminChatId = process.env.TELEGRAM_ADMIN_CHATID;

  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const baseApiUrl = 'https://api.telegram.org'
    this.bot = new TelegramBot(token, { polling: false,  baseApiUrl});
  }

  async sendMessage(message: string, options?: SendMessageOptions, chatId?: string | number): Promise<void> {

    const targetChatId = chatId ?? this.adminChatId;

    if (!targetChatId) {
      this.logger.warn('Error send message to telegram. No chatId provided');
      return
    }

    try {
      await this.bot.sendMessage(targetChatId, message, options);
    } catch (error) {
      this.logger.warn(`Error send message to telegram: ${error.response.body.description}`);
    }
  }

}
