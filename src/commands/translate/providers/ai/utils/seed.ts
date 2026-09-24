import type {JSONObject} from '@diplodoc/translation';

import {
    alignBlocks,
    linkRelation,
    parseBlocks,
    unitAnchors,
    unitLinks,
    unitProse,
    unwrap,
} from './align';
import {keepsMarkup, restoreHoistedMarkers} from './markup';
import {foreignWordPattern, untranslatedMarker} from './script';

export type TranslationSide = {
    units: string[];
    skeleton?: string | JSONObject;
};

/**
 * A source unit with its existing translation. A doubtful pair is kept for
 * the file it came from but stays out of the shared dictionary.
 */
export type SeedPair = [source: string, target: string, doubtful?: true];

export type AlignedUnits = {
    pairs: SeedPair[];
    /** Identity pairs that still look untranslated: left for the model. */
    skipped: number;
    /** Source units without a counterpart in the translation. */
    unseeded: number;
    /** Pairs kept for the file only, see `doubtfulPair`. */
    doubtful: number;
    blocks: {
        source: number;
        target: number;
        paired: number;
    };
};

export type AlignLanguages = {
    source: string;
    target: string;
};

/**
 * Pairs the units of a source file with the units of its existing
 * translation.
 *
 * Blocks (paragraphs, list items, table rows, yaml properties) are aligned
 * first, see `alignBlocks`; units are then paired inside each block pair.
 * A divergence stays inside its block: a merged sentence costs the seeds of
 * one paragraph, not of the whole file.
 *
 * Inside a block pair with equal unit counts units are paired positionally,
 * and a pair is kept only when the language-independent anchors of both
 * units agree (numbers, inline code, links): a wrong pair would put a wrong
 * sentence into the document, an unseeded unit only costs a model request.
 * With different counts only units with anchors unique inside the block on
 * both sides are paired.
 *
 * Identity pairs that still contain source-script characters are
 * untranslated leftovers: seeding them would freeze the source text as a
 * "translation", so they are skipped and left for the LLM.
 */
export function alignTranslationUnits(
    source: TranslationSide,
    target: TranslationSide,
    languages: AlignLanguages,
): AlignedUnits {
    const marker = untranslatedMarker(languages.source, languages.target);
    const doubtful = doubtfulPair(languages);
    const linkLanguages = [languages.source, languages.target];
    const sourceBlocks = parseBlocks(source.skeleton, source.units, linkLanguages);
    const targetBlocks = parseBlocks(target.skeleton, target.units, linkLanguages);
    const result: AlignedUnits = {
        pairs: [],
        skipped: 0,
        unseeded: 0,
        doubtful: 0,
        blocks: {source: sourceBlocks.length, target: targetBlocks.length, paired: 0},
    };
    const seeded = new Set<number>();

    for (const [i, j] of alignBlocks(sourceBlocks, targetBlocks, linkLanguages)) {
        result.blocks.paired++;

        for (const [s, targetUnit] of pairBlockUnits(
            sourceBlocks[i].units,
            targetBlocks[j].units,
            source.units,
            target.units,
            linkLanguages,
        )) {
            const sourceUnit = source.units[s];

            seeded.add(s);

            if (sourceUnit === targetUnit && marker?.test(sourceUnit)) {
                result.skipped++;
                continue;
            }

            if (doubtful(sourceUnit, targetUnit)) {
                result.doubtful++;
                result.pairs.push([sourceUnit, targetUnit, true]);
            } else {
                result.pairs.push([sourceUnit, targetUnit]);
            }
        }
    }

    result.unseeded = source.units.length - seeded.size;

    return result;
}

/**
 * Pairs of a source unit index with the translation to seed for it: the
 * target unit made reusable under the source skeleton, see
 * `reusableTarget`.
 */
function pairBlockUnits(
    sourceIds: number[],
    targetIds: number[],
    sourceUnits: string[],
    targetUnits: string[],
    languages: string[],
): [number, string][] {
    const candidates: [number, number][] = [];

    if (sourceIds.length === targetIds.length) {
        sourceIds.forEach((id, k) => candidates.push([id, targetIds[k]]));
    } else {
        const bySource = uniqueAnchors(sourceIds, sourceUnits, languages);
        const byTarget = uniqueAnchors(targetIds, targetUnits, languages);

        for (const [anchors, s] of bySource) {
            const t = byTarget.get(anchors);
            if (t !== undefined) {
                candidates.push([s, t]);
            }
        }
    }

    return candidates
        .map(([s, t]): [number, string] => [s, reusableTarget(sourceUnits[s], targetUnits[t])])
        .filter(([s, target]) => compatibleUnits(sourceUnits[s], target, languages));
}

const WRAPPED_UNIT = /^(\s*<source(?:\s[^>]*)?>)([\s\S]*)(<\/source>\s*)$/;

/**
 * The target unit as it has to be seeded: with the markers its own
 * skeleton took put back, unless the source skeleton restores them. A
 * translator's code span at the edge of a sentence is reused this way
 * instead of sending the sentence back to the model.
 */
function reusableTarget(source: string, target: string): string {
    const match = WRAPPED_UNIT.exec(target);

    if (!match) {
        return restoreHoistedMarkers(unwrap(source), target);
    }

    const [, open, text, close] = match;
    const restored = restoreHoistedMarkers(unwrap(source), text);

    return restored === text ? target : open + restored + close;
}

/**
 * Whether two units can be translations of each other: same numbers, every
 * code span and link of one present in the other, and the inline markup of
 * the translation consistent with the source. A translator may put a
 * parameter name into code the source left plain, that is fine; a unit
 * whose code marker was hoisted into its own skeleton is not, because the
 * source skeleton would then restore a marker the unit still carries.
 */
export function compatibleUnits(source: string, target: string, languages: string[] = []): boolean {
    const numbers = (unit: string) =>
        unitAnchors(unit)
            .filter((anchor) => anchor.startsWith('num:'))
            .join('\n');

    return (
        numbers(source) === numbers(target) &&
        codesMatch(source, target) &&
        linksMatch(source, target, languages, true) &&
        keepsMarkup(unwrap(source), unwrap(target))
    );
}

/**
 * Whether the code spans of two units match. A code span pairs with a code
 * span of the same text on the other side. One left without a pair may be
 * words the other side leaves plain, verbatim or with other separators
 * (`row_cache` for "row cache"), but only while the other side has no code
 * of its own left: `getUser` in code for `getuser` in code is another
 * identifier, whatever plain text is around.
 */
function codesMatch(source: string, target: string): boolean {
    const sourceCodes = new Set(codeTexts(source));
    const targetCodes = new Set(codeTexts(target));
    // An identifier in code on both sides is paired however many times each
    // side repeats it.
    const unpaired = [...sourceCodes].filter((code) => !targetCodes.has(code));
    const rest = [...targetCodes].filter((code) => !sourceCodes.has(code));

    if (unpaired.length && rest.length) {
        return false;
    }

    return (
        unpaired.every((code) => inProse(target, code)) &&
        rest.every((code) => inProse(source, code))
    );
}

// Separators of the words of an identifier written as words.
const WORD_JOINERS = /[\s_-]+/;
// A word of its own: no letter or digit around it, and no joiner of a
// longer identifier, path or name (`row_cache_size`, `config.yaml`,
// `/usr/bin`, `$HOME`, `C++`).
const WORD_START = String.raw`(?<![\p{L}\p{N}_$]|[\p{L}\p{N}][-.\/:@#+])`;
const WORD_END = String.raw`(?![\p{L}\p{N}_+]|[-.\/:@#][\p{L}\p{N}])`;
// A word as prose writes it: one case, or a capital letter and small ones.
const PLAIN_CASE = /^(?:\p{Lu}?[\p{Ll}\p{N}]*|[\p{Lu}\p{N}]*)$/u;

/**
 * Whether the plain text of a unit has the code as a word of its own, an
 * identifier of several words (`row_cache`) with any separators ("row
 * cache", "row-cache"). A longer word, identifier or path around it does
 * not count: `id` is not in "uuid", `row_cache` is not in `row_cache_size`,
 * `config` is not in "config.yaml". Case may differ only for a word of one
 * case longer than two characters ("JSON" for `json`), not for a flag
 * (`-f`, `-F`) or a name in mixed case (`getUser`). A code of one character
 * or without letters and digits is never confirmed by text.
 */
function inProse(unit: string, code: string): boolean {
    if ([...code].length < 2 || !/[\p{L}\p{N}]/u.test(code)) {
        return false;
    }

    const words = code.split(WORD_JOINERS).filter(Boolean);
    const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = words.length > 1 ? words.map(escape).join('[\\s_-]+') : escape(code);
    const caseless =
        code.length > 2 &&
        !code.startsWith('-') &&
        (code === code.toLowerCase() || code === code.toUpperCase());

    const matches = unitProse(unit).matchAll(
        new RegExp(`${WORD_START}${pattern}${WORD_END}`, caseless ? 'giu' : 'gu'),
    );

    // A word in mixed case ("getUser") is a name of its own even for a code
    // in one case (`getuser`); a capitalized word ("Row Cache") is not.
    return [...matches].some(([text]) =>
        text.split(/[^\p{L}\p{N}]+/u).every((word) => PLAIN_CASE.test(word)),
    );
}

/**
 * Whether every link of each unit has a link to the same page in the other
 * one, see `linkRelation`; with `nested`, also one to the page on another
 * site under a section less.
 */
function linksMatch(source: string, target: string, languages: string[], nested: boolean): boolean {
    const sourceLinks = unitLinks(source);
    const targetLinks = unitLinks(target);
    const accepted = (from: string, to: string) => {
        const relation = linkRelation(from, to, languages);

        return relation === 'same' || (nested && relation === 'nested');
    };

    return (
        sourceLinks.every((from) => targetLinks.some((to) => accepted(from, to))) &&
        targetLinks.every((to) => sourceLinks.some((from) => accepted(from, to)))
    );
}

/** Whether the links of a pair only match with a section of a path added. */
function nestedLinks(source: string, target: string, languages: string[]): boolean {
    return !linksMatch(source, target, languages, false);
}

function codeTexts(unit: string): string[] {
    return unitAnchors(unit)
        .filter((anchor) => anchor.startsWith('code:'))
        .map((anchor) => anchor.slice('code:'.length));
}

// A pair this much longer on one side is rarely a translation; short units
// (headings, labels) vary too much in length to judge.
const DOUBTFUL_RATIO = 3;
const DOUBTFUL_MIN_LENGTH = 40;
const MIN_FOREIGN_WORD = 2;

const TAGS = /<[^<>]+>/g;
const ENTITIES = /&#?\w+;/g;

/**
 * Builds the check for pairs the anchors accept but the text makes
 * unlikely: a word copied from the other language's script (a Latin
 * identifier in Cyrillic text) missing on the other side, or lengths that
 * differ several times over. Such a pair usually means the translation
 * diverged from the source at this place: a sentence merged with its
 * neighbour, a stale paragraph. It still reproduces what the file has, so
 * it is kept for that file, but it must not teach the shared dictionary.
 */
export function doubtfulPair(
    languages: AlignLanguages,
): (source: string, target: string) => boolean {
    const inTarget = foreignWordPattern(languages.target, languages.source);
    const inSource = foreignWordPattern(languages.source, languages.target);

    const missing = (pattern: RegExp | null, from: string, other: string) => {
        if (!pattern) {
            return false;
        }
        const haystack = other.toLowerCase();
        for (const [word] of from.matchAll(pattern)) {
            if (word.length >= MIN_FOREIGN_WORD && !haystack.includes(word.toLowerCase())) {
                return true;
            }
        }
        return false;
    };

    const linkLanguages = [languages.source, languages.target];

    return (source, target) => {
        if (nestedLinks(source, target, linkLanguages)) {
            return true;
        }

        const sourceText = unwrap(source).replace(TAGS, ' ').replace(ENTITIES, ' ').trim();
        const targetText = unwrap(target).replace(TAGS, ' ').replace(ENTITIES, ' ').trim();

        if (
            missing(inTarget, targetText, sourceText) ||
            missing(inSource, sourceText, targetText)
        ) {
            return true;
        }

        const longer = Math.max(sourceText.length, targetText.length);
        const shorter = Math.max(1, Math.min(sourceText.length, targetText.length));

        return longer > DOUBTFUL_MIN_LENGTH && longer / shorter > DOUBTFUL_RATIO;
    };
}

/** Units keyed by their anchors, keeping the keys that occur exactly once. */
function uniqueAnchors(ids: number[], units: string[], languages: string[]): Map<string, number> {
    const counts = new Map<string, number>();
    const result = new Map<string, number>();

    ids.forEach((id) => {
        const key = unitAnchors(units[id], languages).join('\n');
        if (!key) {
            return;
        }
        counts.set(key, (counts.get(key) || 0) + 1);
        result.set(key, id);
    });

    for (const [key, count] of counts) {
        if (count > 1) {
            result.delete(key);
        }
    }

    return result;
}
