import { Module } from '@nestjs/common';
import { MailerService } from './mailer.service';
import { CurrencyModule } from '../currency/currency.module';

@Module({
    imports: [CurrencyModule],
    providers: [MailerService],
    exports: [MailerService],
})
export class MailerModule { }
