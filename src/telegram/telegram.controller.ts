import { Body, Controller, Logger, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TelegramService } from './telegram.service';

@ApiTags('Telegram Webhook')
@Controller('telegram')
export class TelegramController {
    private readonly logger = new Logger(TelegramController.name);

    constructor(private readonly telegramService: TelegramService) { }

    /**
     * Public endpoint for Telegram Bot API webhook.
     * Telegram sends updates here when users interact with the bot.
     * No auth guard — Telegram needs to reach this directly.
     */
    @ApiOperation({ summary: 'Telegram webhook endpoint' })
    @Post('webhook')
    async handleWebhook(@Body() update: any) {
        this.logger.log(`Telegram update received: ${update.update_id}`);

        try {
            await this.telegramService.handleUpdate(update);
        } catch (error) {
            this.logger.error(`Webhook processing error: ${error.message}`);
        }

        // Always return 200 to Telegram, otherwise it retries
        return { ok: true };
    }
}
