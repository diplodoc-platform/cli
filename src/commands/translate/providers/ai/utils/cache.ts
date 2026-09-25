import type {SeedPair} from './seed';
import type {SkeletonFragment} from './skeleton';

import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';

import {lcs} from './align';
import {bag, bagSimilarity} from './diff';

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
    files: Record<string, [string, string][]>;
    /** Absent in seeds written before skeleton fragments: nothing to restore then. */
    skeletons?: Record<string, SkeletonFragment[]>;
};

/** The previous version of a changed unit: a source the file no longer contains and its translation. */
export type SeedHint = {source: string; translation: string};

// Version 3 keeps the source text in the per-file memory instead of its
// hash, so that a changed unit can be compared with the previous sources.
const SEED_VERSION = 3;

// A unit this close to an unused entry of the file memory is an edit of it;
// below the threshold it is a new sentence. Measured on ru->en point edits:
// a one-word edit of a five-word heading scores 0.8.
const HINT_MIN_SIMILARITY = 0.6;

/**
 * Fingerprint-free translation memory derived from existing target files.
 *
 * Unlike TranslationStore, seeds represent the observable state of the
 * repository, not an LLM output, so they survive prompt, glossary and
 * model changes. Each seeding run derives the state anew, so flush()
 * fully replaces the file.
 *
 * Two views of the same pairs are kept. The dictionary (`get`) maps a unit
 * text to its most common translation across the corpus: a sentence new
 * to a file gets the wording the corpus already uses. The per-file memory
 * (`memory`) keeps the pairs of every file in document order, so that a
 * sentence repeated in one file with different wordings keeps each of
 * them in place when the file is translated again, and so that a changed
 * sentence can be traced back to its previous version.
 *
 * Next to the pairs a file keeps the pieces of its translation that live
 * in the skeleton and that the translator localized: code blocks and
 * lines with heading ids or link destinations, see `SkeletonFragment`.
 */
export class SeedStore {
    private readonly file: string;

    private translations: Record<string, string> = {};

    private files: Record<string, [string, string][]> = {};

    private skeletons: Record<string, SkeletonFragment[]> = {};

    private readonly counts = new Map<string, Map<string, number>>();

    constructor(file: string) {
        this.file = file;
    }

    load() {
        if (!existsSync(this.file)) {
            return;
        }

        try {
            const data = JSON.parse(readFileSync(this.file, 'utf8')) as SeedFile;
            if (data.version === SEED_VERSION && data.translations) {
                this.translations = data.translations;
                this.files = data.files || {};
                this.skeletons = data.skeletons || {};
            }
        } catch {
            // A corrupted seed file is not fatal - start from scratch.
        }
    }

    get(text: string): string | undefined {
        return this.translations[hash(text)];
    }

    /**
     * Records one pair into the dictionary. The most frequent translation
     * of a text wins; on a tie the first recorded one stays, so callers
     * recording in a fixed order get a deterministic dictionary.
     */
    set(text: string, translation: string) {
        const key = hash(text);
        const variants = this.counts.get(key) || new Map<string, number>();
        const count = (variants.get(translation) || 0) + 1;

        variants.set(translation, count);
        this.counts.set(key, variants);

        const current = this.translations[key];
        if (current === undefined || count > (variants.get(current) || 0)) {
            this.translations[key] = translation;
        }
    }

    /**
     * Records the pairs of a file, in document order. Every pair enters the
     * per-file memory; doubtful pairs stay out of the dictionary.
     */
    record(file: string, pairs: SeedPair[], fragments: SkeletonFragment[] = []) {
        this.files[file] = pairs.map(([text, translation]) => [text, translation]);
        for (const [text, translation, doubtful] of pairs) {
            if (!doubtful) {
                this.set(text, translation);
            }
        }
        // A new seed of the file replaces its fragments, none found included.
        if (fragments.length) {
            this.skeletons[file] = fragments;
        } else {
            delete this.skeletons[file];
        }
    }

    /** Source/translation pairs recorded for a file, in document order. */
    memory(file: string): [string, string][] | undefined {
        return this.files[file];
    }

    /** Localized skeleton fragments recorded for a file. */
    fragments(file: string): SkeletonFragment[] {
        return this.skeletons[file] || [];
    }

    flush() {
        mkdirSync(dirname(this.file), {recursive: true});
        writeFileSync(
            this.file,
            JSON.stringify({
                version: SEED_VERSION,
                translations: this.translations,
                files: this.files,
                skeletons: this.skeletons,
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

    /** The seed pairs of a file, see `SeedStore.memory`. */
    memory(file: string): [string, string][] {
        return this.seeds?.memory(file) || [];
    }

    /** The localized skeleton fragments of a file, see `SeedStore.fragments`. */
    fragments(file: string): SkeletonFragment[] {
        return this.seeds?.fragments(file) || [];
    }

    /**
     * Stored translations for the units of one file, in order.
     *
     * The per-file seed memory comes first: units are matched to the
     * recorded sequence of the file by longest common subsequence, so an
     * unchanged sentence gets the translation it had at the same place
     * even when the same sentence is worded differently elsewhere. Units
     * the sequence does not cover (a moved section, a new sentence) fall
     * back to the seed dictionary and then to this run's own translations.
     */
    resolve(file: string, texts: string[]): (string | undefined)[] {
        return this.match(file, texts).translations;
    }

    /**
     * The previous version of every unit `resolve()` leaves without a
     * translation, see `lookup()`.
     */
    hints(file: string, texts: string[]): (SeedHint | undefined)[] {
        return this.lookup(file, texts).hints;
    }

    /**
     * `resolve()` and `hints()` in one pass over the file memory.
     *
     * The entries of the memory the sequence match did not use are the
     * units the file no longer contains, and the closest of them by word
     * overlap to an unresolved unit is what the unit was before the edit.
     * Units are served in document order and an entry is used once, so two
     * edited sentences never share a previous version. Nothing for files
     * without a memory and for units too far from every unused entry.
     *
     * Word bags are built once per text: a file changed as a whole (a
     * switched code mode, new vars) compares every unit with every unused
     * entry, and the pairs that cannot reach the threshold by their sizes
     * alone are skipped before any counting.
     */
    lookup(
        file: string,
        texts: string[],
    ): {translations: (string | undefined)[]; hints: (SeedHint | undefined)[]} {
        const {translations, unused} = this.match(file, texts);
        const hints: (SeedHint | undefined)[] = texts.map(() => undefined);
        const memory = this.seeds?.memory(file) || [];
        const candidates = unused.map((j) => ({index: j, bag: bag(memory[j][0])}));
        const free = new Set(candidates);

        for (let i = 0; i < texts.length && free.size; i++) {
            if (translations[i] !== undefined) {
                continue;
            }

            const unit = bag(texts[i]);
            let best: (typeof candidates)[number] | undefined;
            let score = HINT_MIN_SIMILARITY;

            for (const candidate of free) {
                // Dice cannot exceed 2 * min / (min + max): sizes too far
                // apart never reach the threshold.
                const min = Math.min(unit.size, candidate.bag.size);
                const max = Math.max(unit.size, candidate.bag.size);
                if ((2 * min) / (min + max) < HINT_MIN_SIMILARITY) {
                    continue;
                }

                const value = bagSimilarity(unit, candidate.bag);
                if (value > score || (value === score && !best)) {
                    best = candidate;
                    score = value;
                }
            }

            if (best) {
                free.delete(best);
                hints[i] = {source: memory[best.index][0], translation: memory[best.index][1]};
            }
        }

        return {translations, hints};
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

    /**
     * Matches the units of a file to its seed memory, see `resolve()`.
     * Returns the translation of every unit and the indexes of the memory
     * entries no unit took.
     */
    private match(
        file: string,
        texts: string[],
    ): {translations: (string | undefined)[]; unused: number[]} {
        const translations = texts.map((text) => this.get(text));
        const memory = this.seeds?.memory(file);

        if (!memory?.length) {
            return {translations, unused: []};
        }

        const used = new Uint8Array(memory.length);
        const matched = new Uint8Array(texts.length);

        for (const [i, j] of lcs(
            texts,
            memory.map(([source]) => source),
        )) {
            translations[i] = memory[j][1];
            used[j] = 1;
            matched[i] = 1;
        }

        // Units outside the common subsequence (a section moved as a whole)
        // still take the unused entries of the same text, in order.
        let cursor = 0;
        for (let i = 0; i < texts.length; i++) {
            if (matched[i]) {
                continue;
            }
            for (let j = cursor; j < memory.length; j++) {
                if (!used[j] && memory[j][0] === texts[i]) {
                    translations[i] = memory[j][1];
                    used[j] = 1;
                    cursor = j + 1;
                    break;
                }
            }
        }

        const unused: number[] = [];
        used.forEach((flag, j) => {
            if (!flag) {
                unused.push(j);
            }
        });

        return {translations, unused};
    }
}
