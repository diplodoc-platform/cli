import type {Scalar, YAMLMap, YAMLSeq} from 'yaml';
import type {TextPlan} from './types';

import {isDeepStrictEqual} from 'node:util';
import * as yaml from 'yaml';

type Item = {
    key: string;
    stableKey?: string;
    node: YAMLMap;
};

type LabelEdit = {index: number; from: number; to: number; scalar: Scalar<string>; flow: boolean};
type Insertion = {
    offset: number;
    column: number;
    indentation: number;
    snippet: string;
    labels: LabelEdit[];
};

function conflict(reason: string): never {
    throw new Error('Cannot project changed TOC: ' + reason);
}

function parse(text: string) {
    const doc = yaml.parseDocument(text, {keepSourceTokens: true});
    if (doc.errors.length || !yaml.isMap(doc.contents)) {
        conflict('expected a valid YAML mapping');
    }
    return doc.contents;
}

function itemKey(node: YAMLMap): {stableKey?: string; key?: string} {
    const include = node.get('include', true);
    const fields = [
        ['href', node.get('href')],
        ['include', yaml.isMap(include) ? include.get('path') : node.get('include')],
        ['url', node.get('url')],
    ];
    for (const [field, value] of fields) {
        if (typeof value === 'string' && value.length) {
            const key = field + ':' + value;
            return {key, stableKey: key};
        }
    }
    const name = node.get('name');
    return typeof name === 'string' && name.length ? {key: 'name:' + name} : {};
}

function items(sequence: YAMLSeq): Item[] {
    return sequence.items.map((node) => {
        if (!yaml.isMap(node)) {
            return conflict('navigation items must be mappings');
        }
        const {key, stableKey} = itemKey(node);
        if (!key) {
            return conflict('navigation items must have stable keys');
        }
        return {node, key, stableKey};
    });
}

function leafKeys(node: YAMLMap): Set<string> {
    const list = node.get('items', true);
    if (!yaml.isSeq(list)) {
        return new Set();
    }
    return new Set(
        items(list).flatMap((item) => [
            ...(item.stableKey ? [item.stableKey] : []),
            ...leafKeys(item.node),
        ]),
    );
}

function findItem(target: Item[], source: Item) {
    const leaves = source.stableKey ? new Set<string>() : leafKeys(source.node);
    const matches = target.filter((candidate) =>
        source.stableKey || leaves.size === 0
            ? candidate.key === source.key
            : !candidate.stableKey && isDeepStrictEqual(leaves, leafKeys(candidate.node)),
    );
    if (matches.length > 1) {
        conflict('navigation anchor is ambiguous');
    }
    return matches[0];
}

function plainFields(map: YAMLMap) {
    if (map.items.some(({key}) => !yaml.isScalar(key) || typeof key.value !== 'string')) {
        conflict('navigation keys must be strings');
    }
    return Object.fromEntries(
        map.items
            .filter(({key}) => yaml.isScalar(key) && key.value !== 'items')
            .map(({key, value}) => [
                (key as Scalar).value,
                yaml.isNode(value) ? value.toJSON() : value,
            ]),
    );
}

function lineStart(text: string, position: number) {
    return position ? text.lastIndexOf('\n', position - 1) + 1 : 0;
}

/** Keep the leading comment lines attached to their original item. */
function beforeItem(text: string, dash: number) {
    let start = lineStart(text, dash);
    const indentation = text.slice(start, dash);
    while (start > 0) {
        const previous = lineStart(text, start - 1);
        if (!text.startsWith(indentation + '#', previous)) {
            break;
        }
        start = previous;
    }
    return start;
}

function lineEnd(text: string, position: number) {
    if (position && text[position - 1] === '\n') {
        return position;
    }
    const next = text.indexOf('\n', position);
    return next < 0 ? text.length : next + 1;
}

function indicator(sequence: YAMLSeq, index: number) {
    const token = sequence.srcToken;
    const offset =
        token?.type === 'block-seq'
            ? token.items[index]?.start.find((part) => part.type === 'seq-item-ind')?.offset
            : undefined;
    if (offset === undefined) {
        return conflict('navigation anchors require block-style sequences');
    }
    return offset;
}

function nodeEnd(node: YAMLMap) {
    return node.range?.[2] ?? conflict('missing navigation item range');
}

function formatLabel(value: string, edit: LabelEdit) {
    if (edit.scalar.type === 'QUOTE_DOUBLE' || /[\r\n]/.test(value)) {
        return JSON.stringify(value);
    }
    if (edit.scalar.type === 'QUOTE_SINGLE') {
        return "'" + value.replace(/'/g, "''") + "'";
    }
    if (edit.flow && /[()[\]{},]/.test(value)) {
        return JSON.stringify(value);
    }
    return yaml.stringify(value, {lineWidth: 0}).trimEnd();
}

function reindent(snippet: string, delta: number, eol: string) {
    return snippet
        .split(/\r\n|\r|\n/)
        .map((line) => {
            if (!line) {
                return line;
            }
            if (delta >= 0) {
                return ' '.repeat(delta) + line;
            }
            return line.slice(Math.min(-delta, line.length - line.trimStart().length));
        })
        .join(eol);
}

/** Translate labels of inserted entries and apply keyed insertions to the target YAML text. */
export function planToc(beforeText: string, afterText: string, targetText: string): TextPlan {
    const before = parse(beforeText);
    const after = parse(afterText);
    const target = parse(targetText);
    const labels: {href: string; name: string}[] = [];
    const insertions: Insertion[] = [];

    function collectLabels(item: Item, start: number, edits: LabelEdit[]) {
        const node = item.node;
        if (node.has('name')) {
            const scalar = node.get('name', true);
            if (
                !yaml.isScalar(scalar) ||
                typeof scalar.value !== 'string' ||
                !scalar.range ||
                scalar.type === 'BLOCK_FOLDED' ||
                scalar.type === 'BLOCK_LITERAL'
            ) {
                conflict('expected a single-line string navigation label');
            }
            const [from, to] = scalar.range;
            const index = labels.length;
            labels.push({
                name: scalar.value,
                href: `https://example.invalid/diplodoc-update-label-${index}.md`,
            });
            edits.push({
                index,
                from: from - start,
                to: to - start,
                scalar: scalar as Scalar<string>,
                flow: Boolean(node.flow),
            });
        }
        if (node.has('items')) {
            const list = node.get('items', true);
            if (!yaml.isSeq(list)) {
                return conflict('navigation items must be a sequence');
            }
            for (const child of items(list)) {
                collectLabels(child, start, edits);
            }
        }
    }

    function compareMaps(oldMap: YAMLMap, newMap: YAMLMap, targetMap: YAMLMap | undefined) {
        if (!isDeepStrictEqual(plainFields(oldMap), plainFields(newMap))) {
            conflict('only additions to keyed navigation lists are supported');
        }
        const oldSequence = oldMap.get('items', true);
        const newSequence = newMap.get('items', true);
        if (!oldMap.has('items') && !newMap.has('items')) {
            return;
        }
        if (!yaml.isSeq(oldSequence) || !yaml.isSeq(newSequence)) {
            conflict('expected an existing navigation list');
        }
        const older = items(oldSequence);
        const newer = items(newSequence);
        const oldByKey = new Map(older.map((item) => [item.key, item]));
        if (
            oldByKey.size !== older.length ||
            new Set(newer.map((item) => item.key)).size !== newer.length
        ) {
            conflict('source navigation keys are ambiguous');
        }
        if (
            !isDeepStrictEqual(
                newer.filter(({key}) => oldByKey.has(key)).map(({key}) => key),
                older.map(({key}) => key),
            )
        ) {
            conflict('cannot remove or reorder navigation entries');
        }
        if (isDeepStrictEqual(oldSequence.toJSON(), newSequence.toJSON())) {
            return;
        }

        const targetSequence = targetMap?.get('items', true);
        if (!yaml.isSeq(targetSequence)) {
            return conflict('navigation anchor list was not found in the target');
        }
        const localized = items(targetSequence);

        for (let index = 0; index < newer.length; ) {
            const item = newer[index];
            const previous = oldByKey.get(item.key);
            if (previous) {
                if (!isDeepStrictEqual(previous.node.toJSON(), item.node.toJSON())) {
                    compareMaps(previous.node, item.node, findItem(localized, previous)?.node);
                }
                index++;
                continue;
            }

            const first = index;
            while (index < newer.length && !oldByKey.has(newer[index].key)) {
                index++;
            }
            const added = newer.slice(first, index);
            if (added.some((addition) => findItem(localized, addition))) {
                conflict('navigation entry already exists in the target');
            }

            const left = newer[first - 1] && oldByKey.get(newer[first - 1].key);
            const right = newer[index] && oldByKey.get(newer[index].key);
            const leftItem = left && findItem(localized, left);
            const rightItem = right && findItem(localized, right);
            if (
                (!leftItem && !rightItem) ||
                (leftItem &&
                    rightItem &&
                    localized.indexOf(leftItem) >= localized.indexOf(rightItem))
            ) {
                conflict('cannot locate an ordered target anchor');
            }

            const neighbor = leftItem ?? rightItem!;
            const dash = indicator(targetSequence, localized.indexOf(neighbor));
            const targetStart = lineStart(targetText, dash);
            const offset = leftItem
                ? lineEnd(targetText, nodeEnd(leftItem.node))
                : beforeItem(targetText, dash);
            const sourceDash = indicator(newSequence, first);
            const start = beforeItem(afterText, sourceDash);
            const end = lineEnd(afterText, nodeEnd(added.at(-1)!.node));
            const edits: LabelEdit[] = [];
            for (const addition of added) {
                yaml.visit(addition.node, {
                    Alias: () => conflict('inserted navigation entries use YAML aliases'),
                    Node: (_, node) => {
                        if ('anchor' in node && node.anchor) {
                            conflict('inserted navigation entries use YAML anchors');
                        }
                    },
                });
                collectLabels(addition, start, edits);
            }
            insertions.push({
                offset,
                column: sourceDash - lineStart(afterText, sourceDash),
                indentation: dash - targetStart,
                snippet: afterText.slice(start, end),
                labels: edits.sort((left, right) => right.from - left.from),
            });
        }
    }

    compareMaps(before, after, target);
    const input = labels.length ? yaml.stringify({items: labels}) : '';
    const eol = targetText.match(/\r\n|\n/)?.[0] ?? '\n';
    const ordered = insertions.sort((left, right) => right.offset - left.offset);
    if (ordered.some((insertion, index) => insertion.offset === ordered[index - 1]?.offset)) {
        conflict('multiple navigation insertions share a target anchor');
    }

    function project(values: string[]): string {
        let result = targetText;
        for (const {offset, column, indentation, snippet, labels} of ordered) {
            let rendered = snippet;
            for (const edit of labels) {
                rendered =
                    rendered.slice(0, edit.from) +
                    formatLabel(values[edit.index], edit) +
                    rendered.slice(edit.to);
            }
            rendered = reindent(rendered, indentation - column, eol);
            if (!rendered.endsWith('\n') && offset < targetText.length) {
                rendered += eol;
            }
            if (offset && targetText[offset - 1] !== '\n') {
                rendered = eol + rendered;
            }
            result = result.slice(0, offset) + rendered + result.slice(offset);
        }
        parse(result);
        return result;
    }

    const preflight = project(labels.map(({name}) => name));
    return {
        input,
        apply(translated) {
            if (!input) {
                if (translated) {
                    conflict('unexpected translation for a structural update');
                }
                return preflight;
            }
            const list = parse(translated).get('items', true);
            if (!yaml.isSeq(list) || list.items.length !== labels.length) {
                return conflict('translation label count differs');
            }
            const values = list.items.map((item, index) => {
                const name = yaml.isMap(item) ? item.get('name') : null;
                if (
                    !yaml.isMap(item) ||
                    item.get('href') !== labels[index].href ||
                    typeof name !== 'string' ||
                    !name.trim()
                ) {
                    return conflict('translation label is missing or reordered');
                }
                return name;
            });
            return project(values);
        },
    };
}
