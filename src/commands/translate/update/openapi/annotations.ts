import {isDeepStrictEqual} from 'node:util';
import {compose} from '@diplodoc/translation';
import {XMLBuilder} from 'fast-xml-parser';
import MarkdownIt from 'markdown-it';

import {type UnitNode, extractYfm, sourceNodes, yfmInlineInventory} from '../text/yfm-units';

import {conflict} from './graph';

const placeholder = /%%%(\d+)%%%/g;
const inlineSlots = /%%%\d+%%%(?:[ \t]+%%%\d+%%%)*/g;
const xml = new XMLBuilder({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '',
    suppressEmptyNode: true,
});
const commonmark = new MarkdownIt({html: true});
type Render = (translated: readonly string[]) => string;

export function textValue(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        Boolean(value.trim()) &&
        // Reject control characters in translated markup.
        // eslint-disable-next-line no-control-regex
        !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value.replace(/\r\n/g, '\n'))
    );
}

export function trimTrailing(value: string) {
    return value.replace(/\r\n/g, '\n').replace(/\n+$/, '');
}

/** With existing bundles, derive identity from native protected spans. */
export function markup(text: string): string[] {
    const {protectedText, verbatimSpans} = yfmInlineInventory(text);
    if (protectedText.length || verbatimSpans.length) {
        return protectedText.length ? protectedText : verbatimSpans;
    }
    // The extractor can also leave an identity-bearing directive or anchor
    // outside all units. Punctuation-only formatting is insufficient.
    const fixed = extractYfm(text).skeleton.replace(inlineSlots, '%%%').trim();
    return /\p{L}/u.test(fixed) ? [fixed] : [];
}

function softBreak(attrs: Record<string, string>) {
    return attrs.ctype === 'lb' && /^&#10;[ \t]*$/.test(attrs['equiv-text']);
}

/** Keep native source wraps out of the model payload. Hard breaks encode their marker. */
function joinSoftLines(unit: string, nodes: UnitNode[]) {
    let joined = false;
    function visit(nodes: UnitNode[]): UnitNode[] {
        return nodes.map((node) => {
            if (node[':@'] && softBreak(node[':@'])) {
                joined = true;
                return {'#text': ' '};
            }
            return node.g ? {...node, g: visit(node.g)} : node;
        });
    }
    const source = visit(nodes);
    return joined ? xml.build([{source, ':@': {'xml:space': 'preserve'}}]) : unit;
}

type UnitStructure = {
    tags: unknown[];
    code: string[];
    hasProse: boolean;
};

/** Compare protected XML separately from prose and sentence boundaries. */
function unitStructure(nodes: UnitNode[], references: (value: string) => unknown): UnitStructure {
    const tags: unknown[] = [];
    const code: string[] = [];
    let literal: string | undefined;
    let hasProse = false;
    for (const node of nodes) {
        const text = node['#text'];
        const attrs = node[':@'];
        if (text !== undefined) {
            if (literal !== undefined) {
                literal += text;
            } else {
                hasProse ||= /\p{L}/u.test(text);
            }
        } else if (attrs?.ctype === 'code_open') {
            literal = attrs['equiv-text'];
        } else if (attrs?.ctype === 'code_close') {
            if (literal === undefined) {
                conflict('unpaired native code token');
            }
            code.push(literal + attrs['equiv-text']);
            literal = undefined;
        } else if (attrs) {
            if (softBreak(attrs)) {
                continue;
            }
            const attributes = Object.entries(attrs)
                .filter(([name]) => name !== 'id')
                .map(([name, value]) => [name, references(value)]);
            const nested = node.g && unitStructure(node.g, references);
            hasProse ||= nested?.hasProse ?? false;
            tags.push([attributes, nested && {tags: nested.tags, code: nested.code}]);
        }
    }
    if (literal !== undefined) {
        conflict('unpaired native code token');
    }
    return {tags, code: code.sort(), hasProse};
}

function annotation(text: string) {
    if (text.match(placeholder)) {
        conflict('ambiguous native translation placeholder');
    }
    // The YFM extractor disables the CommonMark reference rule. Guard its
    // definitions before they can travel to the model as ordinary prose.
    const env: {references?: object} = {};
    commonmark.parse(text, env);
    if (env.references) {
        conflict('unsupported reference-link definitions in YFM annotation');
    }
    const {skeleton, units, warnings} = extractYfm(text);
    if (warnings?.length) {
        conflict('could not extract complete YFM annotation');
    }
    const nodes = units.map(sourceNodes);
    // Re-extracting a translated sentence may split it into more units. A
    // run of native slots joined by horizontal whitespace occupies one span.
    // Fixed bytes, including intervening newlines and block markers, still
    // delimit the spans exactly as they appeared in the source skeleton.
    function frame(value: string) {
        const spans: UnitStructure[] = [];
        const fixed = value.replace(inlineSlots, (slots) => {
            const contents = [...slots.matchAll(placeholder)].flatMap(([, index]) => {
                const unit = nodes[Number(index)];
                if (!unit) {
                    conflict('missing native YFM unit');
                }
                return unit;
            });
            spans.push(unitStructure(contents, references));
            return '%%%';
        });
        return {fixed, spans};
    }
    function references(value: string) {
        return value.match(placeholder) ? frame(value) : value;
    }
    const hasProse = nodes.some((unit) => unitStructure(unit, (value) => value).hasProse);
    return {skeleton, units, nodes, hasProse, ...frame(skeleton)};
}

function sameFrame(
    source: ReturnType<typeof annotation>,
    translated: ReturnType<typeof annotation>,
) {
    return source.fixed === translated.fixed && isDeepStrictEqual(source.spans, translated.spans);
}

/** Translate complete annotations with YFM, retaining the source's fixed syntax. */
export function textPlanner() {
    const fragments: string[] = [];
    const indices = new Map<string, number>();
    function prepare(original: string): Render {
        const source = annotation(original);
        if (!source.hasProse) {
            return () => original;
        }
        if (compose(source.skeleton, source.units, {useSource: true}) !== original) {
            conflict('YFM annotation cannot round-trip without loss');
        }
        const joined = source.units.map((unit, i) => joinSoftLines(unit, source.nodes[i]));
        const reflowed = joined.some((unit, i) => unit !== source.units[i])
            ? compose(source.skeleton, joined, {useSource: true})
            : original;
        const input =
            reflowed !== original && sameFrame(source, annotation(reflowed)) ? reflowed : original;
        if (!indices.has(input)) {
            indices.set(input, fragments.length);
            fragments.push(input);
        }
        const index = indices.get(input)!;
        const prefix = original.slice(0, original.length - original.trimStart().length);
        const suffix = original.slice(original.trimEnd().length);
        return (translations) => {
            const value = translations[index];
            if (!textValue(value)) {
                conflict(`empty YFM translation (fragment ${index + 1})`);
            }
            const candidate = prefix + value.trim() + suffix;
            const translated = annotation(candidate);
            if (!sameFrame(source, translated)) {
                conflict(`translation changes protected YFM markup (fragment ${index + 1})`);
            }
            const result = compose(translated.skeleton, translated.units, {useSource: true});
            if (result !== candidate) {
                conflict(`lossy YFM translation (fragment ${index + 1})`);
            }
            return result;
        };
    }
    return {fragments, prepare};
}
