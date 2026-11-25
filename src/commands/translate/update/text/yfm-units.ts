import {compose, extract} from '@diplodoc/translation';
import {XMLParser} from 'fast-xml-parser';

const options: Parameters<typeof extract.md>[1] = {
    compact: false,
    // Fenced examples are copied from the source by the incremental projector.
    code: 'no',
    source: {language: 'en', locale: 'US'},
    target: {language: 'en', locale: 'US'},
};

type YfmExtract = {skeleton: string; units: string[]; warnings?: string[]};
export type UnitNode = {
    source?: UnitNode[];
    g?: UnitNode[];
    '#text'?: string;
    ':@'?: Record<string, string>;
};

export function extractYfm(markdown: string): YfmExtract {
    return extract.md(markdown, options);
}

const xml = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseTagValue: false,
    trimValues: false,
});
const slot = /%%%\d+%%%/g;
export function sourceNodes(unit: string): UnitNode[] {
    return (xml.parse(unit) as UnitNode[])[0]?.source ?? [];
}

export function walkUnit(nodes: UnitNode[], visit: (node: UnitNode) => void) {
    for (const node of nodes) {
        visit(node);
        if (node.g) {
            walkUnit(node.g, visit);
        }
    }
}

/** Plain translatable units, used for language checks on Markdown descriptions. */
export function yfmProse(markdown: string): string {
    const {units, warnings} = extractYfm(markdown);
    if (warnings?.length) {
        throw new Error('Cannot extract Markdown prose');
    }
    return units
        .map((unit) => {
            let prose = '';
            let code = false;
            walkUnit(sourceNodes(unit), (node) => {
                const kind = node[':@']?.ctype;
                if (kind === 'code_open') {
                    code = true;
                }
                if (kind === 'code_close') {
                    code = false;
                }
                if (!code) {
                    prose += node['#text'] ?? (node.g ? '' : ' ');
                }
            });
            return prose.trim();
        })
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ');
}

type InlineInventory = {
    protectedText: string[];
    verbatimSpans: string[];
    opaque: boolean;
};

const spanPayload = (span: string) => span.slice(':no-translate['.length, -1);

export function unwrappedDestination(destination: string) {
    if (destination.startsWith(':no-translate[') && destination.endsWith(']')) {
        return {destination: spanPayload(destination), wrapper: destination};
    }
    return {destination, wrapper: undefined};
}

/** Inventory based on the inline tokens emitted by the YFM extractor. */
export function yfmInlineInventory(markdown: string): InlineInventory {
    const protectedText: string[] = [];
    const verbatimSpans: string[] = [];
    const {skeleton, units, warnings} = extractYfm(markdown);
    let opaque = Boolean(warnings?.length);
    const residual = skeleton.replace(slot, '').trim();
    // Trailing attributes and protected spans can sit outside XLIFF units.
    // Put the native skeleton residue in inline context to inspect those.
    const edgeUnits = residual ? extractYfm('before ' + residual + ' after').units : [];
    const inspect = (unit: string) => {
        let code: string | undefined;
        walkUnit(sourceNodes(unit), (node) => {
            const attrs = node[':@'];
            const literal = attrs?.['equiv-text'] ?? '';
            switch (attrs?.ctype) {
                case 'code_open':
                    code = literal;
                    break;
                case 'code_close':
                    protectedText.push((code ?? '') + literal);
                    code = undefined;
                    break;
                case 'link':
                case 'link_text_part_close':
                case 'image': {
                    const suffix = attrs['x-end'] ?? literal;
                    const markup = suffix.startsWith('](') ? suffix.slice(2, -1) : suffix;
                    const {destination, wrapper} = unwrappedDestination(markup);
                    protectedText.push(
                        [
                            attrs.ctype,
                            attrs['x-begin'],
                            destination.replace(slot, '%%%title%%%'),
                        ].join(':'),
                    );
                    if (wrapper) {
                        verbatimSpans.push(wrapper);
                    }
                    break;
                }
                case 'no_translate_inline': {
                    verbatimSpans.push(literal);
                    const payload = yfmInlineInventory(spanPayload(literal));
                    protectedText.push(...payload.protectedText);
                    break;
                }
                case 'link_autolink':
                case 'liquid_Variable':
                case 'liquid_Attributes':
                    protectedText.push(literal);
                    break;
                case 'html_inline':
                    opaque = true;
                    break;
                default:
                    if (code !== undefined) {
                        code += node['#text'] ?? '';
                    } else if (
                        /(?:{%|\]\(|\]\[|<\/?[a-zA-Z!]|\x60|:no-translate\[)/.test(
                            node['#text'] ?? '',
                        )
                    ) {
                        // The extractor emits unsupported directives, reference
                        // links and damaged markup as ordinary text.
                        opaque = true;
                    }
            }
        });
        if (code !== undefined) {
            opaque = true;
        }
    };
    [...units, ...edgeUnits].forEach(inspect);
    return {protectedText, verbatimSpans, opaque};
}

/** Recognize a standalone include in the native skeleton and preserve its raw directive. */
export function standaloneInclude(markdown: string): string | undefined {
    const content = markdown.split(/\r\n|\r|\n/).filter((line) => line.trim());
    if (content.length !== 1 || !content[0].startsWith('{%')) {
        return undefined;
    }
    const {skeleton, units, warnings} = extractYfm(content[0]);
    if (
        warnings?.length ||
        units.length !== 1 ||
        !/^{%[ \t]+include[ \t]+(?:notitle[ \t]+)?\[%%%0%%%\]\(.*\)[ \t]+%}[ \t]*$/.test(
            skeleton,
        ) ||
        compose(skeleton, units, {useSource: true}) !== content[0]
    ) {
        return undefined;
    }
    return content[0].trimEnd();
}
