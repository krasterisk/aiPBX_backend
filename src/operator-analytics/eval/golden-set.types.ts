import * as fs from 'fs';
import * as path from 'path';
import { GoldenReference } from './eval-metrics';

/**
 * A single expert-labeled call used for offline evaluation of the analytics LLM.
 * `transcript` is fed to the model; `reference` holds the human ground-truth scores.
 */
export interface GoldenCase {
    id: string;
    description?: string;
    /** Optional language hint (informational only). */
    language?: string;
    transcript: string;
    reference: GoldenReference;
}

export const GOLDEN_SET_DIR = path.join(__dirname, 'golden-set');

/** Load and validate all golden-set fixtures from the golden-set directory. */
export function loadGoldenSet(dir: string = GOLDEN_SET_DIR): GoldenCase[] {
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    const cases: GoldenCase[] = [];
    for (const file of files) {
        const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch (e) {
            throw new Error(`Invalid JSON in golden-set fixture ${file}: ${(e as Error).message}`);
        }
        const entries = Array.isArray(parsed) ? parsed : [parsed];
        for (const entry of entries) {
            validateGoldenCase(entry, file);
            cases.push(entry as GoldenCase);
        }
    }
    return cases;
}

function validateGoldenCase(entry: any, file: string): void {
    if (!entry || typeof entry !== 'object') {
        throw new Error(`Golden case in ${file} is not an object`);
    }
    if (typeof entry.id !== 'string' || !entry.id) {
        throw new Error(`Golden case in ${file} is missing a string "id"`);
    }
    if (typeof entry.transcript !== 'string' || !entry.transcript.trim()) {
        throw new Error(`Golden case ${entry.id} in ${file} is missing a non-empty "transcript"`);
    }
    if (!entry.reference || typeof entry.reference !== 'object') {
        throw new Error(`Golden case ${entry.id} in ${file} is missing a "reference" object`);
    }
}
