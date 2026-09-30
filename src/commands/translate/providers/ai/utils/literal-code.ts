import {createHash} from 'node:crypto';

// Only complete literal spans are protected. Partial spans crossing unit
// boundaries must retain their original placeholders for structural checks.
const LITERAL =
    /<x\b[^>]*ctype="code_open"[^>]*\/>[\s\S]*?<x\b[^>]*ctype="code_close"[^>]*\/>|<g\b[^>]*ctype="code(?:_inline)?"[^>]*>[\s\S]*?<\/g>/g;
const identity = (text: string) =>
    createHash('sha256')
        .update(text.replace(/\s+id="[^"]*"/g, ''))
        .digest('hex')
        .slice(0, 16);
const placeholder = (text: string) => `<x ctype="code_literal" id="literal-${identity(text)}"/>`;
const MASK = /<x\b[^>]*ctype="code_literal"[^>]*\/>/g;
const id = (tag: string) => /\bid="literal-([^"]+)"/.exec(tag)?.[1];

/** Identity and multiplicity must survive, including when code is reordered. */
export function keepsLiteralCode(source: string, translation: string): boolean {
    const inventory = (text: string) =>
        Array.from(text.matchAll(MASK), ([tag]) => id(tag)).sort((left, right) =>
            String(left).localeCompare(String(right)),
        );
    return JSON.stringify(inventory(source)) === JSON.stringify(inventory(translation));
}

/** Keep literal code out of the model request, just like link destinations. */
export function maskLiteralCode(text: string): string {
    return text.replace(LITERAL, placeholder);
}

/** Restore only placeholders actually returned; missing/duplicate ones fail the guard. */
export function unmaskLiteralCode(source: string, translation: string): string {
    // Leave invalid opaque tokens unexpanded: the ordinary markup guard must
    // reject the missing source code, not accept duplicated/replaced literals.
    if (!keepsLiteralCode(maskLiteralCode(source), translation)) {
        return translation;
    }
    const literals = new Map(
        Array.from(source.matchAll(LITERAL), ([text]) => [identity(text), text]),
    );
    return translation.replace(MASK, (tag) => {
        const key = id(tag);
        return key === undefined ? tag : (literals.get(key) ?? tag);
    });
}
