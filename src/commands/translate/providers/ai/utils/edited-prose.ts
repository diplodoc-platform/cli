import type {SeedHint} from './cache';

/** Prose with original casing; literal code, addresses and attributes removed. */
function proseText(text: string): string {
    return text
        .replace(/<g\b[^>]*ctype="code(?:_inline)?"[^>]*>[\s\S]*?<\/g>/g, ' ')
        .replace(
            /<x\b[^>]*ctype="code_open"[^>]*\/>[\s\S]*?(?:<x\b[^>]*ctype="code_close"[^>]*\/>|$)/g,
            ' ',
        )
        .replace(/(`+)[\s\S]*?\1/g, ' ')
        .replace(/(?:https?:\/\/|mailto:)[^\s<>]+/g, ' ')
        .replace(/<[^>]*>/g, ' ');
}

function unprotectedProse(translation: string, marker: RegExp, allowed: readonly string[]): string {
    const text = proseText(translation);
    const edge = `(?:${marker.source}|\\p{M})`;
    const protectedSpans: [number, number][] = [];
    for (const spelling of allowed) {
        if (!spelling || !marker.test(spelling)) {
            continue;
        }
        const escaped = spelling.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        for (const match of text.matchAll(new RegExp(`(?<!${edge})${escaped}(?!${edge})`, 'gu'))) {
            protectedSpans.push([match.index, match.index + match[0].length]);
        }
    }
    // All matches refer to the original prose: overlapping terms are not
    // destroyed by replacing a shorter term first.
    protectedSpans.sort((a, b) => a[0] - b[0]);
    let unprotected = '';
    let cursor = 0;
    for (const [start, end] of protectedSpans) {
        if (start > cursor) {
            unprotected += text.slice(cursor, start) + ' ';
        }
        cursor = Math.max(cursor, end);
    }
    unprotected += text.slice(cursor);
    return unprotected;
}

/** Words in prose, excluding literal code, addresses and placeholder attributes. */
function proseWords(text: string): string[] {
    return (
        proseText(text)
            .toLowerCase()
            .match(/[\p{L}\p{M}]+/gu) || []
    );
}

/**
 * Finds unprotected lowercase words in a source-exclusive cased script.
 * Titlecase names, acronyms and single-letter symbols are conservative
 * exceptions; explicit target glossary spellings are preserved verbatim.
 * Callers limit this policy to language pairs verified by their regressions.
 */
export function hasLowercaseSourceProse(
    translation: string,
    marker: RegExp | null,
    allowed: string[] = [],
): boolean {
    if (!marker) {
        return false;
    }
    const unprotected = unprotectedProse(translation, marker, allowed);
    const sourceWords = new RegExp(`(?:${marker.source})(?:${marker.source}|\\p{M})*`, 'gu');
    return (unprotected.match(sourceWords) || []).some(
        (word) =>
            Array.from(word).filter((letter) => /\p{L}/u.test(letter)).length > 1 &&
            word === word.toLowerCase() &&
            word !== word.toUpperCase(),
    );
}

/** Whether source-script characters occur in prose rather than protected data. */
export function hasSourceProse(text: string, marker: RegExp | null): boolean {
    return Boolean(marker && proseWords(text).some((word) => marker.test(word)));
}

/** Punctuation, spacing or case changes alone do not translate source prose. */
export function isProseEcho(source: string, translation: string, marker: RegExp | null): boolean {
    if (!marker) {
        return false;
    }
    const words = proseWords(source);
    if (!words.some((word) => marker.test(word))) {
        return false;
    }
    const translated = proseWords(translation);
    return (
        words.length === translated.length &&
        words.every((word, index) => word === translated[index])
    );
}

/** Detect copied new prose, not old localized names or protected literal text. */
export function hasCopiedEdit(
    source: string,
    translation: string,
    hint: SeedHint | undefined,
    marker: RegExp | null,
    allowed: string[] = [],
): boolean {
    if (!hint || !marker) {
        return false;
    }
    const existing = new Set(proseWords([hint.source, hint.translation, ...allowed].join(' ')));
    const additions = new Set(
        proseWords(source).filter((word) => marker.test(word) && !existing.has(word)),
    );
    return proseWords(translation).some((word) => additions.has(word));
}

/** Narrow wrong-language check; mixed prose and proper names remain conservative. */
export function hasUnexpectedEnglishProse(
    source: string,
    translation: string,
    marker: RegExp | null,
    glossary: readonly {sourceText: string; translatedText: string}[] = [],
): boolean {
    if (!marker) return false;
    const original = proseText(source);
    const sourcePattern = new RegExp(`(?:${marker.source})(?:${marker.source}|\\p{M})*`, 'gu');
    const sourceWords = (original.match(sourcePattern) || []).filter(
        (word) => Array.from(word).filter((letter) => /\p{L}/u.test(letter)).length > 1,
    );
    if (sourceWords.length < 2) return false;
    const required = glossary
        .filter(({sourceText}) => {
            const term = sourceText.trim();
            if (!term) return false;
            const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
            return new RegExp(
                '(?<![\\p{L}\\p{M}\\p{N}_])' + escaped + '(?![\\p{L}\\p{M}\\p{N}_])',
                'iu',
            ).test(original);
        })
        .map(({translatedText}) => translatedText);
    const prose = unprotectedProse(translation, /\p{Script=Latn}/u, required);
    if (/\p{Script=Han}/u.test(prose)) return false;
    // Address/path components and identifiers are not ordinary words. A final
    // sentence period is still allowed after a word; a domain separator is not.
    const words =
        prose.match(
            /(?<![\p{L}\p{M}\p{N}_.@/{}%+-])\p{Script=Latn}[\p{Script=Latn}\p{M}]*(?![\p{L}\p{M}\p{N}_@/{}%+-]|\.[\p{L}\p{N}])/gu,
        ) || [];
    return (
        words.length >= 2 &&
        words.some((word) => word === word.toLowerCase() && word !== word.toUpperCase())
    );
}
