import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname} from 'node:path';

const VERSION = 1;

type StoreFile = {
    version: number;
    fingerprint: string;
    translations: Record<string, string>;
};

function hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

/**
 * Builds a cache fingerprint from everything that affects translation output.
 * When any of these change, stored translations are stale and the cache resets.
 */
export function cacheFingerprint(parts: unknown): string {
    return hash(JSON.stringify(parts));
}

/**
 * File-backed translation memory: unit text hash -> translation.
 *
 * The store is loaded once per run and flushed after each processed file,
 * so repeated runs only send new or changed units to the LLM.
 */
export class TranslationStore {
    private readonly file: string;

    private readonly fingerprint: string;

    private translations: Record<string, string> = {};

    private dirty = false;

    constructor(file: string, fingerprint: string) {
        this.file = file;
        this.fingerprint = fingerprint;
    }

    load() {
        if (!existsSync(this.file)) {
            return;
        }

        try {
            const data = JSON.parse(readFileSync(this.file, 'utf8')) as StoreFile;
            if (
                data.version === VERSION &&
                data.fingerprint === this.fingerprint &&
                data.translations
            ) {
                this.translations = data.translations;
            }
        } catch {
            // A corrupted cache is not fatal - start from scratch.
        }
    }

    get(text: string): string | undefined {
        return this.translations[hash(text)];
    }

    set(text: string, translation: string) {
        this.translations[hash(text)] = translation;
        this.dirty = true;
    }

    flush() {
        if (!this.dirty) {
            return;
        }

        mkdirSync(dirname(this.file), {recursive: true});
        writeFileSync(
            this.file,
            JSON.stringify({
                version: VERSION,
                fingerprint: this.fingerprint,
                translations: this.translations,
            }),
        );
        this.dirty = false;
    }
}
