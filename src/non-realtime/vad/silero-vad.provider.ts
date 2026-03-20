import { Logger } from '@nestjs/common';
import { IVadProvider, VadConfig, VadResult } from '../interfaces/vad-provider.interface';

/**
 * Silero VAD Provider.
 *
 * Uses @ricky0123/vad-node ONNX model for per-frame voice activity detection.
 * Runs on CPU, ~50 MB RAM, ~2-5ms per frame.
 *
 * Frame size: 1536 samples @ 16kHz = 96ms (recommended by Silero)
 * Input: PCM16 16kHz mono
 */
export class SileroVadProvider implements IVadProvider {
    readonly name = 'silero';
    private readonly logger = new Logger(SileroVadProvider.name);
    private ort: any = null;
    private session: any = null;
    private _sr: any = null;          // ONNX tensor: sample rate
    private _h: any = null;           // ONNX tensor: hidden state
    private _c: any = null;           // ONNX tensor: cell state
    private config: VadConfig;
    private initialized = false;

    async init(config: VadConfig): Promise<void> {
        this.config = config;

        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            this.ort = require('onnxruntime-node');
            const modelPath = require.resolve('@ricky0123/vad-node/dist/silero_vad.onnx');

            this.session = await this.ort.InferenceSession.create(modelPath);
            this.resetOnnxState();

            this.initialized = true;
            this.logger.log(
                `Silero VAD initialized (threshold: ${config.threshold}, ` +
                `silence: ${config.silenceDurationMs}ms, prefix: ${config.prefixPaddingMs}ms)`,
            );
        } catch (err) {
            this.logger.error(
                'Failed to initialize Silero VAD. Is @ricky0123/vad-node installed?',
                err.message,
            );
            throw err;
        }
    }

    async processSamples(pcm16: Buffer): Promise<VadResult> {
        if (!this.initialized || !this.session) {
            return { isSpeech: false, probability: 0 };
        }

        // Convert Buffer (PCM16 LE) → Float32Array
        const sampleCount = pcm16.length / 2;
        const float32 = new Float32Array(sampleCount);
        for (let i = 0; i < sampleCount; i++) {
            float32[i] = pcm16.readInt16LE(i * 2) / 32768;
        }

        // Process in 1536-sample frames (recommended by Silero)
        const frameSize = 1536;
        let maxProbability = 0;

        for (let offset = 0; offset + frameSize <= float32.length; offset += frameSize) {
            const frame = float32.slice(offset, offset + frameSize);
            const probability = await this.runOnnxFrame(frame);
            if (probability > maxProbability) {
                maxProbability = probability;
            }
        }

        return {
            isSpeech: maxProbability >= this.config.threshold,
            probability: maxProbability,
        };
    }

    reset(): void {
        this.resetOnnxState();
    }

    destroy(): void {
        this.session = null;
        this.ort = null;
        this.initialized = false;
    }

    /**
     * Run one frame through the ONNX Silero VAD model.
     * Returns speech probability [0..1].
     */
    private async runOnnxFrame(frame: Float32Array): Promise<number> {
        const Tensor = this.ort.Tensor;

        const inputTensor = new Tensor('float32', frame, [1, frame.length]);

        const feeds = {
            input: inputTensor,
            sr: this._sr,
            h: this._h,
            c: this._c,
        };

        const result = await this.session.run(feeds);

        // Update hidden/cell state for next frame
        this._h = result.hn;
        this._c = result.cn;

        // Output probability
        return result.output.data[0] as number;
    }

    /**
     * Reset ONNX internal state (call between utterances).
     */
    private resetOnnxState(): void {
        if (!this.ort) return;
        const Tensor = this.ort.Tensor;

        this._sr = new Tensor('int64', BigInt64Array.from([BigInt(16000)]), []);
        this._h = new Tensor('float32', new Float32Array(2 * 64).fill(0), [2, 1, 64]);
        this._c = new Tensor('float32', new Float32Array(2 * 64).fill(0), [2, 1, 64]);
    }
}
