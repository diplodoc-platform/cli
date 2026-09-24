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

    for (const [i, j] of alignBlocks(sourceBlocks, targetBlocks)) {
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
        hasLinksOf(target, source, languages, true) &&
        hasLinksOf(source, target, languages, true) &&
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
    const rest = codeTexts(target);
    const unpaired: string[] = [];

    for (const code of codeTexts(source)) {
        const index = rest.indexOf(code);

        if (index < 0) {
            unpaired.push(code);
        } else {
            rest.splice(index, 1);
        }
    }

    if (unpaired.length && rest.length) {
        return false;
    }

    return (
        unpaired.every((code) => inProse(target, code)) &&
        rest.every((code) => inProse(source, code))
    );
}

/** Whether the plain text of a unit has the code as it is or as words. */
function inProse(unit: string, code: string): boolean {
    const prose = unitProse(unit);

    return prose.includes(code) || loosen(prose).includes(loosen(code));
}

/**
 * Whether every link of `from` has a link to the same page in `unit`, see
 * `linkRelation`; with `nested`, also one to the page under another section.
 */
function hasLinksOf(unit: string, from: string, languages: string[], nested: boolean): boolean {
    const links = unitLinks(unit);
    const accepted = (link: string, other: string) => {
        const relation = linkRelation(link, other, languages);

        return relation === 'same' || (nested && relation === 'nested');
    };

    return unitLinks(from).every((link) => links.some((other) => accepted(link, other)));
}

/** Whether the links of a pair only match with a section of a path added. */
function nestedLinks(source: string, target: string, languages: string[]): boolean {
    return (
        !hasLinksOf(target, source, languages, false) ||
        !hasLinksOf(source, target, languages, false)
    );
}

function codeTexts(unit: string): string[] {
    return unitAnchors(unit)
        .filter((anchor) => anchor.startsWith('code:'))
        .map((anchor) => anchor.slice('code:'.length));
}

const WORD_JOINERS = /[\s_-]+/g;

/** Text with word separators unified, to find an identifier written as words. */
function loosen(text: string): string {
    return text.replace(WORD_JOINERS, ' ').toLowerCase();
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
