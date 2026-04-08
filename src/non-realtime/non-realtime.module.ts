import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { NonRealtimeService } from './non-realtime.service';
import { AudioModule } from '../audio/audio.module';
import { AiCdrModule } from '../ai-cdr/ai-cdr.module';
import { BillingModule } from '../billing/billing.module';
import { McpClientModule } from '../mcp-client/mcp-client.module';
import { WsServerModule } from '../ws-server/ws-server.module';
import { SileroVadProvider } from './vad/silero-vad.provider';
import { WhisperLocalProvider } from './stt/whisper-local.provider';
import { OpenAiChatProvider } from './llm/openai-chat.provider';
import { OllamaChatProvider } from './llm/ollama-chat.provider';
import { Gemma4AudioLlmProvider } from './llm/gemma4-audio-llm.provider';
import { SileroTtsProvider } from './tts/silero-tts.provider';
import { OmniVoiceTtsProvider } from './tts/omnivoice-tts.provider';

@Module({
    imports: [
        AudioModule,
        AiCdrModule,
        BillingModule,
        McpClientModule,
        WsServerModule,
    ],
    providers: [NonRealtimeService],
    exports: [NonRealtimeService],
})
export class NonRealtimeModule implements OnModuleInit {
    private readonly logger = new Logger(NonRealtimeModule.name);

    constructor(private readonly nonRealtimeService: NonRealtimeService) {}

    async onModuleInit() {
        this.logger.log('Initializing non-realtime pipeline providers...');

        // ── VAD: Silero ──
        try {
            const vadProvider = new SileroVadProvider();
            await vadProvider.init({
                threshold: 0.5,
                silenceDurationMs: 500,
                prefixPaddingMs: 300,
            });
            this.nonRealtimeService.registerVadProvider(vadProvider);
            this.logger.log('✅ Silero VAD registered successfully');
        } catch (e) {
            this.logger.warn(`❌ Silero VAD not available: ${e.message}. Install @ricky0123/vad-node to enable.`);
        }

        // ── STT: Whisper Local ──
        const whisperUrl = process.env.WHISPER_API_URL || 'http://whisper:9000/asr';
        this.nonRealtimeService.registerSttProvider('whisper-local', new WhisperLocalProvider(whisperUrl));

        // ── LLM: OpenAI Chat ──
        if (process.env.OPENAI_API_KEY) {
            this.nonRealtimeService.registerLlmProvider('openai', new OpenAiChatProvider());
        } else {
            this.logger.warn('OPENAI_API_KEY not set. OpenAI Chat provider not available.');
        }
        // ── LLM: Ollama (Qwen3, Llama, DeepSeek, etc.) ──
        const ollamaProvider = new OllamaChatProvider();
        this.nonRealtimeService.registerLlmProvider('ollama', ollamaProvider);
        const ollamaHealth = await ollamaProvider.healthCheck();
        if (ollamaHealth.status === 'ok') {
            this.logger.log(`Ollama available. Models: ${ollamaHealth.models?.join(', ') || 'none pulled'}`);
        } else {
            this.logger.warn(`Ollama unavailable at ${ollamaHealth.url}. Deploy ollama container and pull a model first.`);
        }

        // ── LLM: Gemma 4 Audio (Ollama, audio-native — skips STT) ──
        const gemma4Provider = new Gemma4AudioLlmProvider();
        this.nonRealtimeService.registerLlmProvider('gemma4-audio', gemma4Provider);
        const gemma4Health = await gemma4Provider.healthCheck();
        if (gemma4Health.status === 'ok') {
            this.logger.log(`✅ Gemma 4 Audio LLM registered. Models: ${gemma4Health.models?.join(', ')}`);
        } else if (gemma4Health.status === 'no-gemma4-model') {
            this.logger.warn(`⚠️ Gemma 4 Audio registered but no gemma4 model pulled. Run: ollama pull gemma4:e4b`);
        } else {
            this.logger.warn(`❌ Gemma 4 Audio LLM unavailable at ${gemma4Health.url}`);
        }

        // ── TTS: Silero Local ──
        const sileroTtsUrl = process.env.SILERO_TTS_URL || 'http://silero-tts:9001/tts';
        const sileroTts = new SileroTtsProvider(sileroTtsUrl);
        this.nonRealtimeService.registerTtsProvider('silero', sileroTts);

        // Health check Silero TTS container
        const ttsHealth = await sileroTts.healthCheck();
        if (ttsHealth.status !== 'ok') {
            this.logger.warn(`Silero TTS container unavailable at ${ttsHealth.url}. Deploy docker/silero-tts first.`);
        }

        // ── TTS: OmniVoice (GPU, diffusion-based) ──
        const omniVoiceUrl = process.env.OMNIVOICE_TTS_URL;
        if (omniVoiceUrl) {
            const omniVoice = new OmniVoiceTtsProvider(omniVoiceUrl);
            this.nonRealtimeService.registerTtsProvider('omnivoice', omniVoice);
            const omniHealth = await omniVoice.healthCheck();
            if (omniHealth.status === 'ok') {
                this.logger.log('✅ OmniVoice TTS registered successfully');
            } else {
                this.logger.warn(`❌ OmniVoice TTS unavailable at ${omniHealth.url}`);
            }
        } else {
            this.logger.debug('OMNIVOICE_TTS_URL not set. OmniVoice TTS not registered.');
        }

        this.logger.log('Non-realtime pipeline providers initialized.');
    }
}
