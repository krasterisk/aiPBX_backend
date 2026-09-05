import { Module } from '@nestjs/common';
import OpenAI from 'openai';
import { AuthModule } from '../auth/auth.module';
import { ApiKeyModule } from '../api-keys/api-key.module';
import { JwtOrApiKeyGuard } from '../auth/jwt-or-api-key.guard';
import { DEFAULT_COMPAT_MODEL } from './openai-compat.util';
import { listOllamaModelNames } from './list-ollama-models';
import { OpenAiCompatController } from './openai-compat.controller';
import { OpenAiCompatService } from './openai-compat.service';

@Module({
    imports: [AuthModule, ApiKeyModule],
    controllers: [OpenAiCompatController],
    providers: [
        JwtOrApiKeyGuard,
        {
            provide: OpenAiCompatService,
            useFactory: () => {
                const ollamaUrl = process.env.OLLAMA_URL || 'http://ollama:11434';
                const client = new OpenAI({
                    baseURL: `${ollamaUrl.replace(/\/$/, '')}/v1`,
                    apiKey: 'ollama',
                });
                return new OpenAiCompatService(
                    client,
                    () => listOllamaModelNames(ollamaUrl),
                    process.env.DEFAULT_OLLAMA_MODEL || DEFAULT_COMPAT_MODEL,
                );
            },
        },
    ],
})
export class OpenAiCompatModule {}
