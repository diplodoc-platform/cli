import type {TranslationSide} from './seed';

import MarkdownIt from 'markdown-it';

import {isFenceClose, matchFenceOpen} from '~/core/utils';

import {TranslateError, compose} from '../../../utils';

import {unwrap} from './align';
import {alignTranslationUnits, codesMatch, compatibleUnits} from './seed';
import {restoreFragments} from './skeleton';

export type ReuseFormatting = 'target' | 'source';

export function unsafeFormatting(message: string): never {
    throw new TranslateError(message, 'REUSE_FORMATTING_UNSAFE');
}

const TAG = /<\/?(?:g|x)\b[^>]*>/g;
const STYLE = /^(?:bold|italic|strikethrough|sup)(?:_open|_close)?$/;
const attr = (tag: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];

/** Remove parsed style tags only; code, variables, links and YFM are opaque. */
function withoutStyles(text: string): string {
    const stack: boolean[] = [];
    return text.replace(TAG, (tag) => {
        if (tag === '</g>') {
            return stack.pop() ? '' : tag;
        }
        const style = STYLE.test(attr(tag, 'ctype') || '');
        if (tag.startsWith('<g ')) {
            stack.push(style);
        }
        return style ? '' : tag;
    });
}

function tagTypes(text: string): string[] {
    return [...text.matchAll(TAG)].map(([tag]) =>
        tag === '</g>' ? '/g' : `${tag.slice(1, 2)}:${attr(tag, 'ctype')}`,
    );
}

/** Project translated prose into the source's inline tags, refusing unknown span boundaries. */
export function sourceFormattedUnit(source: string, target: string): string {
    const original = unwrap(source);
    const translated = unwrap(target);
    let text = translated;
    if (JSON.stringify(tagTypes(original)) !== JSON.stringify(tagTypes(translated))) {
        text = withoutStyles(translated);
        if (!/ctype="code(?:_open|_close)?"/.test(original)) {
            // Verify complete identifiers before dropping presentation-only code tags.
            if (codesMatch(source, target)) {
                text = text.replace(/<x\b[^>]*ctype="code_(?:open|close)"[^>]*\/>/g, '');
            }
        }
        const plain = withoutStyles(original);
        if (JSON.stringify(tagTypes(original)) !== JSON.stringify(tagTypes(plain))) {
            // A style surrounding an entire unit has a known translated boundary.
            // An interior span cannot be inferred from two different languages.
            const start = original.indexOf(plain);
            if (
                start < 0 ||
                withoutStyles(original.slice(0, start) + original.slice(start + plain.length))
            ) {
                unsafeFormatting(
                    'Cannot locate the approved translation of a source inline style span.',
                );
            }
            text = original.slice(0, start) + text + original.slice(start + plain.length);
        }
    }
    if (JSON.stringify(tagTypes(original)) !== JSON.stringify(tagTypes(text))) {
        unsafeFormatting(
            'Approved translation has incompatible code, variable or inline structure: ' +
                original.slice(0, 100),
        );
    }
    const sourceTags = [...original.matchAll(TAG)].map(([tag]) => tag);
    let index = 0;
    // Use source delimiters, ids and spacing; keep target addresses inside link tags.
    text = text.replace(TAG, (tag) => {
        const template = sourceTags[index++];
        const type = attr(template, 'ctype') || '';
        if (
            !STYLE.test(type) &&
            !/^(link|image)(_|$)/.test(type) &&
            attr(template, 'equiv-text') !== attr(tag, 'equiv-text')
        ) {
            unsafeFormatting('Approved translation changed a protected placeholder.');
        }
        if (/ctype="(?:link|image)(?:_|"|$)/.test(template)) {
            const from = attr(template, 'x-end');
            const to = attr(tag, 'x-end');
            if (from && to) {
                const sourceUrl = /\]\([ \t]*<?([^\s)<>]+)/.exec(from)?.[1];
                const targetUrl = /\]\([ \t]*<?([^\s)<>]+)/.exec(to)?.[1];
                if (sourceUrl && targetUrl) {
                    return template.split(sourceUrl).join(targetUrl);
                }
            }
            // Other address tokens keep their own literal payload and use source ids.
            return tag.replace(/id="[^"]*"/, `id="${attr(template, 'id')}"`);
        }
        return template;
    });
    const wrapped = source.replace(original, text);
    if (!compatibleUnits(source, wrapped)) {
        // Localized URLs are validated by the caller with its language pair.
        // All other literal identities must still agree.
        const noAddresses = (unit: string) =>
            unit.replace(/(<[gx]\b[^>]*ctype="(?:link|image)[^>]*>)/g, '<x/>');
        if (!compatibleUnits(noAddresses(source), noAddresses(wrapped))) {
            unsafeFormatting('Approved translation changed protected literals or identifiers.');
        }
    }
    return wrapped;
}

export function sourceFormattingMemory(
    source: TranslationSide,
    target: TranslationSide,
    languages: {source: string; target: string},
) {
    if (typeof source.skeleton !== 'string' || typeof target.skeleton !== 'string') {
        return unsafeFormatting('Source formatting reuse requires Markdown skeletons.');
    }
    const parser = new MarkdownIt({html: true});
    for (const side of [source, target]) {
        const document = String(compose(side.skeleton as string, side.units, {useSource: true}));
        if (parser.parse(document, {}).some((token) => token.type === 'code_block')) {
            return unsafeFormatting(
                'Indented code blocks are unsupported by source formatting reuse.',
            );
        }
    }
    const aligned = alignTranslationUnits(source, target, languages, sourceFormattedUnit);
    if (
        aligned.unseeded ||
        aligned.skipped ||
        aligned.pairs.length !== source.units.length ||
        target.units.length !== source.units.length
    ) {
        return unsafeFormatting(
            'Approved document does not align completely; cannot reuse its wording with source formatting.',
        );
    }
    // Spacing is formatting. Code and localized addresses/anchors are semantic resources.
    aligned.fragments = aligned.fragments.filter((fragment) => fragment.kind !== 'spacing');
    const restored = restoreFragments(source.skeleton, source.units, aligned.fragments);
    const projectedUnits: string[] = [];
    aligned.pairs.forEach(([, unit], index) => {
        projectedUnits[aligned.unitIds[index]] = unit;
    });
    const fencedContent = (document: string) =>
        parser
            .parse(document, {})
            .filter((token) => token.type === 'fence')
            .map((token) => [token.info, token.content]);
    const projectedDocument = String(compose(restored.skeleton, projectedUnits, {useSource: true}));
    const approvedDocument = String(compose(target.skeleton, target.units, {useSource: true}));
    if (
        JSON.stringify(fencedContent(projectedDocument)) !==
        JSON.stringify(fencedContent(approvedDocument))
    ) {
        return unsafeFormatting(
            'Protected examples cannot be safely paired with the approved translation.',
        );
    }
    if (
        JSON.stringify(protectedExamples(restored.skeleton)) !==
        JSON.stringify(protectedExamples(target.skeleton))
    ) {
        return unsafeFormatting(
            'Protected examples cannot be safely paired with the approved translation.',
        );
    }
    return aligned;
}

/** Read literal fence content with CommonMark's longer-closing-fence rule. */
function protectedExamples(text: string): string[] {
    const examples: string[] = [];
    let open: {markup: string; indent: number; lines: string[]} | undefined;
    for (const line of text.split('\n')) {
        const trimmed = line.trimStart();
        if (open) {
            if (isFenceClose(trimmed, open.markup)) {
                examples.push(open.lines.join('\n'));
                open = undefined;
            } else {
                open.lines.push(line.slice(Math.min(open.indent, line.length - trimmed.length)));
            }
        } else {
            const fence = matchFenceOpen(trimmed);
            if (fence) {
                open = {
                    markup: fence.markup,
                    indent: line.length - trimmed.length,
                    lines: [fence.info],
                };
            }
        }
    }
    if (open) {
        unsafeFormatting('Protected examples contain an unclosed fence.');
    }
    return examples;
}

export function sourceFormattedDocument(
    source: TranslationSide,
    target: TranslationSide,
    languages: {source: string; target: string},
): string {
    const aligned = sourceFormattingMemory(source, target, languages);
    const restored = restoreFragments(source.skeleton as string, source.units, aligned.fragments);
    const units: string[] = [];
    aligned.pairs.forEach(([, unit], index) => {
        units[aligned.unitIds[index]] = unit;
    });
    return String(compose(restored.skeleton, units, {useSource: true}));
}

/** CLI and config share one validated policy; target is the compatibility default. */
export function resolveReuseFormatting(value: unknown): ReuseFormatting {
    if (value === undefined || value === null) {
        return 'target';
    }
    if (value === 'target' || value === 'source') {
        return value;
    }
    throw new Error('reuseFormatting must be target or source.');
}
