import {
    type Node,
    type Pair,
    type YAMLMap,
    type YAMLSeq,
    isAlias,
    isMap,
    isNode,
    isScalar,
    isSeq,
    parseDocument,
    stringify,
    visit,
} from 'yaml';

import {type Address, conflict} from './graph';

function editable(node: Node, address: Address): void {
    if (
        isAlias(node) ||
        node.anchor ||
        node.tag ||
        !node.range ||
        ((isMap(node) || isSeq(node)) && node.flow && node.items.length)
    ) {
        conflict('unsupported YAML edit boundary', address);
    }
}

export function property(node: YAMLMap, key: string | number, address: Address): Pair | undefined {
    let found: Pair | undefined;
    for (const entry of node.items) {
        if (!isScalar(entry.key) || String(entry.key.value) !== String(key)) {
            continue;
        }
        if (found) {
            conflict('ambiguous YAML mapping key', [...address, key]);
        }
        found = entry;
    }
    return found;
}

export function child(node: unknown, key: string | number, address: Address): Node | undefined {
    if (isMap(node)) {
        return property(node, key, address)?.value as Node | undefined;
    }
    if (isSeq(node) && typeof key === 'number') {
        return node.items[key] as Node | undefined;
    }
    return undefined;
}

export function yamlAt(root: Node, address: Address, strict = true): Node | undefined {
    let node: Node | undefined = root;
    for (let i = 0; i < address.length; i++) {
        if (!node) {
            return undefined;
        }
        if (isAlias(node) || node.anchor || (isMap(node) && node.has('$ref'))) {
            if (strict) {
                conflict(
                    'a shared target reference requires explicit localization',
                    address.slice(0, i),
                );
            }
            return undefined;
        }
        node = child(node, address[i], address.slice(0, i));
    }
    return node;
}

/** Read line contents and offsets without backtracking over long scalar values. */
export function scanLines(text: string) {
    const lines: {text: string; eol: string; offset: number}[] = [];
    let offset = 0;
    for (const match of text.matchAll(/\r\n|[\r\n]/g)) {
        const end = match.index!;
        const [eol] = match;
        lines.push({text: text.slice(offset, end), eol, offset});
        offset = end + eol.length;
    }
    lines.push({text: text.slice(offset), eol: '', offset});
    return lines;
}

type Edit = {from: number; to: number; render: (translated: readonly string[]) => string};
export function readTarget(target: string): YAMLMap {
    const doc = parseDocument(target);
    if (doc.errors.length || doc.warnings.length || !isMap(doc.contents)) {
        conflict('invalid target YAML');
    }
    const version = doc.contents.get('openapi');
    if (typeof version !== 'string' || !/^3\.0(?:\.|$)/.test(version)) {
        conflict('expected an existing OpenAPI 3.0 bundle');
    }
    return doc.contents;
}

export class YamlEdits {
    private readonly target: string;
    private readonly eol: string;
    private readonly edits: Edit[] = [];

    constructor(target: string) {
        this.target = target;
        this.eol = target.match(/\r?\n/)?.[0] ?? '\n';
    }

    add(from: number, to: number, render: Edit['render']) {
        this.edits.push({from, to, render});
    }

    insertMapping(
        node: YAMLMap,
        key: string,
        render: (translated: readonly string[]) => unknown,
        address: Address,
    ) {
        const last = node.items.at(-1);
        editable(node, address);
        if (!last || !isScalar(last.key) || !last.key.range || !last.value) {
            conflict('mapping has no block insertion boundary', address);
        }
        const at = last.key.range[0];
        const end = (last.value as Node).range?.[1];
        if (end === undefined) {
            conflict('mapping has no block insertion boundary', address);
        }
        const indent = this.indent(at, address);
        this.insert(this.afterLine(end), (translated) =>
            this.yaml({[key]: render(translated)}, indent),
        );
    }

    omitMapping(key: Node, value: Node, address: Address) {
        editable(key, address);
        editable(value, address);
        visit(value, {
            Value: (_, nested) => {
                if (nested.anchor) {
                    conflict('unsupported YAML edit boundary', address);
                }
            },
        });
        this.indent(key.range![0], address);
        this.add(this.lineStart(key.range![0]), this.afterLine(value.range![1]), () => '');
    }

    replaceScalar(
        key: Node,
        value: Node,
        render: (translated: readonly string[]) => unknown,
        address: Address,
    ) {
        editable(key, address);
        editable(value, address);
        if (!isScalar(value) || !isScalar(key)) {
            conflict('expected a scalar change', address);
        }
        const indent = this.indent(key.range![0], address);
        this.add(value.range![0], value.range![1], (translated) => {
            const output = stringify({value: render(translated)}, {lineWidth: 0})
                .slice('value: '.length)
                .split('\n');
            const first = output.shift()!;
            if (output.length === 1) {
                return first;
            }
            // A block scalar needs its content indented from the parent key.
            const block = output.map((line) => (line ? indent + line : '')).join(this.eol);
            return first + this.eol + block;
        });
    }

    appendLiteral(node: Node, render: (translated: readonly string[]) => string, address: Address) {
        editable(node, address);
        if (!isScalar(node) || node.type !== 'BLOCK_LITERAL') {
            conflict('expected a literal description', address);
        }
        const [start, end] = node.range!;
        const raw = this.target.slice(start, end);
        const lines = scanLines(raw);
        const last = lines.filter((line) => line.text.trim()).at(-1);
        const indent = lines
            .slice(1)
            .map((line) => /^ *\S/.exec(line.text))
            .find(Boolean)?.[0]
            .slice(0, -1);
        if (!indent || !last) {
            conflict('expected an indented literal description', address);
        }
        const at = start + last.offset + last.text.length;
        this.add(at, at, (translated) => {
            const paragraph = render(translated)
                .split('\n')
                .map((line) => (line ? indent + line : ''))
                .join(this.eol);
            return this.eol + this.eol + paragraph;
        });
    }

    sequence(node: YAMLSeq, from: number, to: number, replacement: unknown[], address: Address) {
        editable(node, address);
        for (const [offset, item] of node.items.slice(from, to).entries()) {
            if (!isNode(item)) {
                conflict('unsupported YAML edit boundary', [...address, from + offset]);
            }
            editable(item, [...address, from + offset]);
        }
        const sample = node.items[from] ?? node.items.at(-1);
        if (!isScalar(sample) || !sample.range) {
            conflict('missing block sequence boundary', address);
        }
        const indentation = this.target.slice(this.lineStart(sample.range[0]), sample.range[0]);
        const match = /^( *)- +$/.exec(indentation);
        if (!match) {
            conflict('unsupported sequence indentation', address);
        }
        const last = node.items[to - 1];
        const begin =
            from < node.items.length
                ? this.lineStart(sample.range[0])
                : this.afterLine(sample.range[1]);
        const end = from === to ? begin : this.afterLine((last as Node).range![1]);
        if (!replacement.length && to - from === node.items.length) {
            conflict('emptying a block sequence requires an explicit YAML value', address);
        }
        if (from === to) {
            this.insert(begin, () => this.yaml(replacement, match[1]));
        } else {
            this.add(begin, end, () =>
                replacement.length ? this.yaml(replacement, match[1]) : '',
            );
        }
    }

    apply(translated: readonly string[]) {
        const ordered = this.edits.sort((a, b) => a.from - b.from || a.to - b.to);
        const chunks: string[] = [];
        let position = 0;
        for (const edit of ordered) {
            if (edit.from < position) {
                conflict('overlapping YAML edits');
            }
            chunks.push(this.target.slice(position, edit.from), edit.render(translated));
            position = edit.to;
        }
        chunks.push(this.target.slice(position));
        return chunks.join('');
    }

    private lineStart(index: number) {
        return this.target.lastIndexOf('\n', index - 1) + 1;
    }

    private afterLine(index: number) {
        if (this.target[index - 1] === '\n') {
            return index;
        }
        const newline = this.target.indexOf('\n', index);
        return newline < 0 ? this.target.length : newline + 1;
    }

    private indent(index: number, address: Address) {
        const indent = this.target.slice(this.lineStart(index), index);
        if (!/^ *$/.test(indent)) {
            conflict('expected an indented YAML key', address);
        }
        return indent;
    }

    private yaml(value: unknown, prefix: string) {
        return (
            stringify(value, {lineWidth: 0, aliasDuplicateObjects: false})
                .trimEnd()
                .split('\n')
                .map((line) => (line ? prefix + line : ''))
                .join(this.eol) + this.eol
        );
    }

    private insert(at: number, render: Edit['render']) {
        const separator = at && this.target[at - 1] !== '\n' ? this.eol : '';
        this.add(at, at, (translated) => separator + render(translated));
    }
}
