import {createHash} from 'node:crypto';
import {unescapeAll} from 'markdown-it/lib/common/utils';

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

type LiteralTag = {
    start: number;
    end: number;
    raw: string;
    name: string;
    closing: boolean;
    selfClosing: boolean;
    attributes: Map<string, string>;
    close?: number;
};

type LiteralSpan = {start: number; end: number; raw: string; value: string};

// These are source transport tags, not an HTML parser. Reject ambiguity rather
// than treating attribute-looking text or malformed markup as literal evidence.
function literalTags(text: string, partial = false): LiteralTag[] | undefined {
    const tags: LiteralTag[] = [];
    const opened: number[] = [];
    const ids = new Set<string>();
    const tag = /<\/?[A-Za-z][\w:-]*(?:\s+[A-Za-z_:][\w:.-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*\s*\/?>/y;
    const attr = /\s+([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/y;
    let offset = 0;
    while ((offset = text.indexOf('<', offset)) !== -1) {
        tag.lastIndex = offset;
        const match = tag.exec(text);
        if (!match) {
            return undefined;
        }
        const raw = match[0];
        const head = /^<(\/?)([A-Za-z][\w:-]*)/.exec(raw);
        if (!head) {
            return undefined;
        }
        const closing = Boolean(head[1]);
        const selfClosing = raw.endsWith('/>');
        const body = raw.slice(head[0].length, selfClosing ? -2 : -1);
        const attributes = new Map<string, string>();
        let position = 0;
        while (position < body.trimEnd().length) {
            attr.lastIndex = position;
            const entry = attr.exec(body);
            if (!entry || attributes.has(entry[1])) {
                return undefined;
            }
            attributes.set(entry[1], entry[2] ?? entry[3]);
            position = attr.lastIndex;
        }
        const node: LiteralTag = {
            start: offset,
            end: offset + raw.length,
            raw,
            name: head[2],
            closing,
            selfClosing,
            attributes,
        };
        if (closing && (selfClosing || attributes.size)) {
            return undefined;
        }
        if (!partial) {
            if (closing) {
                const opening = opened.pop();
                if (opening === undefined || tags[opening].name !== node.name) {
                    return undefined;
                }
                tags[opening].close = tags.length;
            } else {
                const sourceId = attributes.get('id');
                if (sourceId) {
                    if (ids.has(sourceId)) {
                        return undefined;
                    }
                    ids.add(sourceId);
                }
                if (!selfClosing) {
                    opened.push(tags.length);
                }
            }
        }
        tags.push(node);
        offset = node.end;
    }
    return opened.length ? undefined : tags;
}

function codeDelimiter(tag: LiteralTag, type: string): string | undefined {
    const attrs = tag.attributes;
    const delimiter = attrs.get('equiv-text') ?? '';
    return tag.name === 'x' &&
        tag.selfClosing &&
        !tag.closing &&
        attrs.size === 3 &&
        attrs.get('ctype') === type &&
        /^x-\d+$/.test(attrs.get('id') ?? '') &&
        /^\x60+$/.test(delimiter) &&
        tag.raw.includes('ctype="' + type + '"')
        ? delimiter
        : undefined;
}

function codeGroup(tag: LiteralTag): boolean {
    const attrs = tag.attributes;
    if (
        tag.name !== 'g' ||
        tag.closing ||
        tag.selfClosing ||
        !/^g-\d+$/.test(attrs.get('id') ?? '') ||
        !tag.raw.includes('ctype="' + attrs.get('ctype') + '"')
    ) {
        return false;
    }
    if (attrs.size === 2) {
        return true;
    }
    const delimiter = attrs.get('x-begin') ?? '';
    return (
        attrs.size === 5 &&
        /^\x60+$/.test(delimiter) &&
        attrs.get('x-end') === delimiter &&
        attrs.get('equiv-text') === delimiter + '{{text}}' + delimiter
    );
}

function literalSpans(text: string, tags: LiteralTag[]): LiteralSpan[] | undefined {
    const spans: LiteralSpan[] = [];
    for (let index = 0; index < tags.length; index++) {
        const open = tags[index];
        if (open.closing) {
            continue;
        }
        const type = open.attributes.get('ctype');
        let close: LiteralTag | undefined;
        if (open.name === 'x' && type === 'code_open') {
            close = tags[index + 1];
            const delimiter = codeDelimiter(open, 'code_open');
            if (!delimiter || !close || codeDelimiter(close, 'code_close') !== delimiter) {
                return undefined;
            }
        } else if (open.name === 'x' && type === 'code_close') {
            return undefined;
        } else if (open.name === 'g' && (type === 'code' || type === 'code_inline')) {
            close = tags[index + 1];
            if (!codeGroup(open) || open.close !== index + 1 || !close?.closing) {
                return undefined;
            }
        }
        if (!close) {
            continue;
        }
        spans.push({
            start: open.start,
            end: close.end,
            raw: text.slice(open.start, close.end),
            value: text.slice(open.end, close.start),
        });
        index++;
    }
    return spans;
}

/** Exact source-owned names for opaque literals; this does not infer enum semantics. */
export function literalCodeIdentities(source: string): ReadonlyMap<string, string> {
    const result = new Map<string, string>();
    const tags = literalTags(source);
    const spans = tags && literalSpans(source, tags);
    if (!spans) {
        return result;
    }
    for (const span of spans) {
        if (/^[A-Z][A-Z0-9_]*_[A-Z0-9_]*$/.test(span.value)) {
            result.set('literal-' + identity(span.raw), span.value);
        }
    }
    return result;
}

function ordinaryIdentities(text: string): Map<string, number> {
    // Keep the same complete spans opaque as the actual request, even when a
    // different code/group crosses this unit's boundary. Identity proof remains
    // stricter; counting must not turn protected code into a prose allowance.
    text = maskLiteralCode(text);
    const tags = literalTags(text, true);
    if (tags) {
        let end = 0;
        let prose = '';
        for (const tag of tags) {
            const type = tag.attributes.get('ctype') ?? '';
            const formatting =
                tag.name === 'source' ||
                (tag.name === 'g' && !type.startsWith('code')) ||
                (tag.name === 'x' && /^(?:bold|italic)_(?:open|close)$/.test(type));
            prose += text.slice(end, tag.start) + (formatting ? '' : ' ');
            end = tag.end;
        }
        text = prose + text.slice(end);
    }
    // Decode after removing real tags: escaped markup remains visible data and
    // cannot hide a copied identity inside an attribute-looking substring.
    for (;;) {
        const decoded = unescapeAll(text);
        if (decoded === text) {
            break;
        }
        text = decoded;
    }
    const counts = new Map<string, number>();
    for (const word of text.match(/[A-Za-z0-9_]+/g) ?? []) {
        counts.set(word, (counts.get(word) ?? 0) + 1);
    }
    return counts;
}

/** Reject added prose copies of read-only identity hints without changing code. */
export function keepsLiteralCodeIdentities(
    source: string,
    translation: string,
    identities: ReadonlyMap<string, string> = literalCodeIdentities(source),
): boolean {
    if (!identities.size) {
        return true;
    }
    const before = ordinaryIdentities(source);
    const after = ordinaryIdentities(translation);
    return [...new Set(identities.values())].every(
        (value) => (after.get(value) ?? 0) <= (before.get(value) ?? 0),
    );
}
