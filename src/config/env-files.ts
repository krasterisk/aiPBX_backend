import * as fs from 'fs';
import * as path from 'path';

/** Env files tried in order (later overrides earlier). */
export function resolveEnvFilePaths(): string[] {
    const nodeEnv = process.env.NODE_ENV || 'development';
    const candidates = [
        '.env',
        `.${nodeEnv}.env`,
        nodeEnv === 'production' ? '.production.env' : '.development.env',
    ];
    const cwd = process.cwd();
    const existing = candidates.filter((f) => fs.existsSync(path.join(cwd, f)));
    return existing.length > 0 ? existing : [`.${nodeEnv}.env`];
}
