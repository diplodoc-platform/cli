import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';

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
 * Path of the seed file for a language pair. Seeds are provider- and
 * model-agnostic, so the name depends on the languages only.
 */
export function seedFilePath(cacheDir: string, source: string, target: string): string {
    return join(cacheDir, `seed.${source}-${target}.json`);
}

type SeedFile = {
    version: number;
    translations: Record<string, string>;
};

/**
 * Fingerprint-free translation memory derived from existing target files.
 *
 * Unlike TranslationStore, seeds represent the observable state of the
 * repository, not an LLM output, so they survive prompt, glossary and
 * model changes. Each seeding run derives the state anew, so flush()
 * fully replaces the file.
 */
export class SeedStore {
    private readonly file: string;

    private translations: Record<string, string> = {};

    constructor(file: string) {
        this.file = file;
    }

    load() {
        if (!existsSync(this.file)) {
            return;
        }

        try {
            const data = JSON.parse(readFileSync(this.file, 'utf8')) as SeedFile;
            if (data.version === VERSION && data.translations) {
                this.translations = data.translations;
            }
        } catch {
            // A corrupted seed file is not fatal - start from scratch.
        }
    }

    get(text: string): string | undefined {
        return this.translations[hash(text)];
    }

    set(text: string, translation: string) {
        this.translations[hash(text)] = translation;
    }

    flush() {
        mkdirSync(dirname(this.file), {recursive: true});
        writeFileSync(
            this.file,
            JSON.stringify({
                version: VERSION,
                translations: this.translations,
            }),
        );
    }
}

/**
 * File-backed translation memory: unit text hash -> translation.
 *
 * The store is loaded once per run and flushed after each processed file,
 * so repeated runs only send new or changed units to the LLM.
 *
 * Optional seeds are consulted first: they reflect the current state of
 * the target files (including manual edits), which outranks translations
 * produced by earlier runs.
 */
export class TranslationStore {
    private readonly file: string;

    private readonly fingerprint: string;

    private readonly seeds?: SeedStore;

    private translations: Record<string, string> = {};

    private dirty = false;

    constructor(file: string, fingerprint: string, seeds?: SeedStore) {
        this.file = file;
        this.fingerprint = fingerprint;
        this.seeds = seeds;
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
        return this.seeds?.get(text) ?? this.translations[hash(text)];
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
