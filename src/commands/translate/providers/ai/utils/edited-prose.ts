import type {SeedHint} from './cache';

function withoutTags(text: string): string {
    let result = '';
    let cursor = 0;
    for (let start = text.indexOf('<'); start !== -1; start = text.indexOf('<', cursor)) {
        const end = text.indexOf('>', start + 1);
        if (end === -1) break;
        result += text.slice(cursor, start) + ' ';
        cursor = end + 1;
    }
    return result + text.slice(cursor);
}

/** Prose with original casing; literal code, addresses and attributes removed. */
function proseText(text: string): string {
    const prose = text
        .replace(/<g\b[^>]*ctype="code(?:_inline)?"[^>]*>[\s\S]*?<\/g>/g, ' ')
        .replace(
            /<x\b[^>]*ctype="code_open"[^>]*\/>[\s\S]*?(?:<x\b[^>]*ctype="code_close"[^>]*\/>|$)/g,
            ' ',
        )
        .replace(/(`+)[\s\S]*?\1/g, ' ')
        .replace(/(?:https?:\/\/|mailto:)[^\s<>]+/g, ' ');
    return withoutTags(prose);
}

function unprotectedProse(translation: string, marker: RegExp, allowed: readonly string[]): string {
    const text = proseText(translation);
    const edge = String.raw`(?:${marker.source}|\p{M})`;
    const protectedSpans: [number, number][] = [];
    for (const spelling of allowed) {
        if (!spelling || !marker.test(spelling)) {
            continue;
        }
        const escaped = spelling.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
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

type QuotedWord = {value: string; start: number; end: number};

function quotedWords(text: string): QuotedWord[] {
    return [
        ...text.matchAll(
            /«([^«»\n]*)»|“([^“”\n]*)”|"([^"\n]*)"|&quot;([^\n]*?)&quot;|「([^「」\n]*)」/g,
        ),
    ].map((match) => ({
        value: match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5],
        start: match.index,
        end: match.index + match[0].length,
    }));
}

/** Exact quoted examples are data only in a complete, explicit prohibition. */
function prohibitedWords(source: string): QuotedWord[] {
    if ((source.match(/<source\b/g) ?? []).length > 1) return [];
    const original = proseText(source).trim();
    const prefix = /^Не\s+используйте\s+слова\s+/iu.exec(original);
    if (!prefix) return [];
    const words = quotedWords(original);
    if (words.length < 2 || words[0].start !== prefix[0].length) return [];
    let cursor = prefix[0].length;
    for (const [index, word] of words.entries()) {
        const gap = original.slice(cursor, word.start);
        if (index && !/^\s*(?:\(кроме [^()\n]*\)\s*)?,\s*(?:и\s+)?$/u.test(gap)) return [];
        const count = word.value.match(/[\p{L}\p{M}]+/gu)?.length ?? 0;
        if (!count || count > 3 || /[.!?;\r\n<>«»“”"「」]|&quot;/u.test(word.value)) return [];
        cursor = word.end;
    }
    const tail = original.slice(cursor).trim().replace(/[.!]$/u, '').trimEnd();
    if (tail && !/^\(кроме [^()\n]*\)$/u.test(tail)) return [];
    return words;
}

function isEnglishProhibition(instruction: string): boolean {
    const text = instruction.replace(/[:：]$/u, '').trimEnd();
    const verb = /^(?:(?:please\s+)?(?:do not|don't|must not|never)\s+use|avoid\s+using)/iu.exec(
        text,
    );
    if (!verb) return false;
    const object = text.slice(verb[0].length);
    return !object || /^\s+(?:(?:the|these)\s+)?(?:following\s+)?words?$/iu.test(object);
}

function maskProhibitedWords(source: string, translation: string): string {
    const words = prohibitedWords(source);
    if (!words.length) return translation;
    const prose = proseText(translation);
    const mentions = quotedWords(prose);
    if (!mentions.length) return translation;
    const instruction = prose.slice(0, mentions[0].start).trim();
    const chinese = /^(?:请)?(?:不要|勿|不应|禁止)\s*使用(?:以下)?(?:词语|单词|文字)?[:：]?$/u.test(
        instruction,
    );
    if (!chinese && !isEnglishProhibition(instruction)) return translation;
    const gloss = String.raw`(?:\([^()\r\n]*\)|（[^（）\r\n]*）)`;
    const separator = new RegExp(
        String.raw`^\s*(?:${gloss}\s*)?(?:[,，、]\s*(?:(?:and|or|和|或)\s*)?|(?:and|or)\s+|[和或])\s*$`,
        'iu',
    );
    const ending = new RegExp(
        String.raw`^\s*(?:${gloss}\s*)?(?:等(?:词语|单词|词)?|这些(?:词语|单词|词))?[.。!！]?\s*$`,
        'u',
    );
    const remaining = new Map<string, number>();
    for (const {value} of words) remaining.set(value, (remaining.get(value) ?? 0) + 1);
    let result = '';
    let cursor = 0;
    let previousEnd = mentions[0].start;
    for (const [index, mention] of mentions.entries()) {
        if (index && !separator.test(prose.slice(previousEnd, mention.start))) return translation;
        const count = remaining.get(mention.value) ?? 0;
        if (!count) return translation;
        result += prose.slice(cursor, mention.start) + ' ';
        cursor = mention.end;
        previousEnd = mention.end;
        remaining.set(mention.value, count - 1);
    }
    if (!ending.test(prose.slice(cursor))) return translation;
    return result + prose.slice(cursor);
}

/** Words in prose, excluding literal code, addresses and placeholder attributes. */
function proseWords(text: string): string[] {
    return (
        proseText(text)
            .toLowerCase()
            .match(/[\p{L}\p{M}]+/gu) || []
    );
}

function sourceScriptWords(text: string, marker: RegExp): string[] {
    const pattern = new RegExp(String.raw`(?:${marker.source})(?:${marker.source}|\p{M})*`, 'gu');
    return Array.from(text.matchAll(pattern), ([word]) => word).filter(
        (word) => Array.from(word).filter((letter) => /\p{L}/u.test(letter)).length > 1,
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
    source?: string,
): boolean {
    if (!marker) {
        return false;
    }
    const text = source === undefined ? translation : maskProhibitedWords(source, translation);
    const unprotected = unprotectedProse(text, marker, allowed);
    return sourceScriptWords(unprotected, marker).some(
        (word) => word === word.toLowerCase() && word !== word.toUpperCase(),
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
    if (sourceScriptWords(original, marker).length < 2) return false;
    const required = glossary
        .filter(({sourceText}) => {
            const term = sourceText.trim();
            if (!term) return false;
            const escaped = term
                .replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
                .replace(/\s+/g, String.raw`\s+`);
            return new RegExp(
                String.raw`(?<![\p{L}\p{M}\p{N}_])${escaped}(?![\p{L}\p{M}\p{N}_])`,
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
