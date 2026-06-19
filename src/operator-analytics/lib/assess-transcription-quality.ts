export type TranscriptionQualityLevel = 'ok' | 'low' | 'unusable';

export interface TranscriptionQualityAssessment {
    quality: TranscriptionQualityLevel;
    confidence: number;
    reasons: string[];
}

export interface TranscriptionQualityInput {
    text?: string;
    avgLogprob?: number;
    noSpeechProb?: number;
    compressionRatio?: number;
    languageProbability?: number;
    wordsCount?: number;
    segmentsCount?: number;
}

export interface TranscriptionQualityThresholds {
    minWords: number;
    avgLogprobMin: number;
    avgLogprobUnusable: number;
    maxNoSpeech: number;
    maxNoSpeechUnusable: number;
    maxCompression: number;
    minCompression: number;
    minLanguageProbability: number;
}

export const DEFAULT_TRANSCRIPTION_QUALITY_THRESHOLDS: TranscriptionQualityThresholds = {
    minWords: 15,
    avgLogprobMin: -1.0,
    avgLogprobUnusable: -1.3,
    maxNoSpeech: 0.6,
    maxNoSpeechUnusable: 0.8,
    maxCompression: 2.4,
    minCompression: 0.5,
    minLanguageProbability: 0.5,
};

export function countTranscriptionWords(text: string): number {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).filter(Boolean).length;
}

export function assessTranscriptionQuality(
    input: TranscriptionQualityInput,
    thresholds: TranscriptionQualityThresholds = DEFAULT_TRANSCRIPTION_QUALITY_THRESHOLDS,
): TranscriptionQualityAssessment {
    const reasons: string[] = [];
    let confidence = 1;
    let quality: TranscriptionQualityLevel = 'ok';

    const setWorst = (next: TranscriptionQualityLevel) => {
        if (next === 'unusable') quality = 'unusable';
        else if (next === 'low' && quality !== 'unusable') quality = 'low';
    };

    const wordsCount = input.wordsCount ?? countTranscriptionWords(input.text || '');
    if (wordsCount < thresholds.minWords) {
        reasons.push('INSUFFICIENT_CONTENT');
        confidence -= 0.55;
        setWorst('unusable');
    }

    if (input.avgLogprob != null) {
        if (input.avgLogprob < thresholds.avgLogprobUnusable) {
            reasons.push('LOW_STT_QUALITY');
            confidence -= 0.35;
            setWorst('unusable');
        } else if (input.avgLogprob < thresholds.avgLogprobMin) {
            reasons.push('LOW_STT_QUALITY');
            confidence -= 0.2;
            setWorst('low');
        }
    }

    if (input.noSpeechProb != null) {
        if (input.noSpeechProb > thresholds.maxNoSpeechUnusable) {
            reasons.push('LOW_STT_QUALITY');
            confidence -= 0.35;
            setWorst('unusable');
        } else if (input.noSpeechProb > thresholds.maxNoSpeech) {
            reasons.push('LOW_STT_QUALITY');
            confidence -= 0.2;
            setWorst('low');
        }
    }

    if (input.compressionRatio != null) {
        if (input.compressionRatio > thresholds.maxCompression || input.compressionRatio < thresholds.minCompression) {
            reasons.push('LOW_STT_QUALITY');
            confidence -= 0.15;
            setWorst('low');
        }
    }

    if (input.languageProbability != null && input.languageProbability < thresholds.minLanguageProbability) {
        reasons.push('LOW_STT_QUALITY');
        confidence -= 0.15;
        setWorst('low');
    }

    return {
        quality,
        confidence: parseFloat(Math.min(1, Math.max(0, confidence)).toFixed(2)),
        reasons: [...new Set(reasons)],
    };
}

export function combineTranscriptionQuality(
    stt: TranscriptionQualityAssessment,
    llm?: { analysis_confidence?: number; insufficient_content?: boolean },
): TranscriptionQualityAssessment {
    if (!llm) return stt;

    const reasons = [...stt.reasons];
    let quality = stt.quality;
    let confidence = stt.confidence;

    if (llm.insufficient_content) {
        reasons.push('INSUFFICIENT_CONTENT');
        confidence = Math.min(confidence, llm.analysis_confidence ?? 0.35);
        if (quality === 'ok') quality = 'low';
    }

    if (llm.analysis_confidence != null && llm.analysis_confidence < 0.4) {
        confidence = Math.min(confidence, llm.analysis_confidence);
        if (quality === 'ok') quality = 'low';
    }

    return {
        quality,
        confidence: parseFloat(Math.min(1, Math.max(0, confidence)).toFixed(2)),
        reasons: [...new Set(reasons)],
    };
}
