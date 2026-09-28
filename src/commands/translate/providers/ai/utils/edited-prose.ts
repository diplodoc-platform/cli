import type {SeedHint} from './cache';

/** Words in prose, excluding literal code, addresses and placeholder attributes. */
function proseWords(text: string): string[] {
    return (
        text
            .replace(/<g\b[^>]*ctype="code(?:_inline)?"[^>]*>[\s\S]*?<\/g>/g, ' ')
            .replace(
                /<x\b[^>]*ctype="code_open"[^>]*\/>[\s\S]*?(?:<x\b[^>]*ctype="code_close"[^>]*\/>|$)/g,
                ' ',
            )
            .replace(/(`+)[\s\S]*?\1/g, ' ')
            .replace(/(?:https?:\/\/|mailto:)[^\s<>]+/g, ' ')
            .replace(/<[^>]*>/g, ' ')
            .toLowerCase()
            .match(/[\p{L}\p{M}]+/gu) || []
    );
}

/** Whether source-script characters occur in prose rather than protected data. */
export function hasSourceProse(text: string, marker: RegExp | null): boolean {
    return Boolean(marker && proseWords(text).some((word) => marker.test(word)));
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
