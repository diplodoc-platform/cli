import type {RawRange} from './apply';

import MarkdownIt from 'markdown-it';
export type RawBlock = RawRange & {
    text: string;
    kind: 'heading' | 'paragraph' | 'opaque' | 'marker' | 'list' | 'table';
    anchors: string[];
    container: string[];
};

const fenceParser = new MarkdownIt({html: true});

/** Preserve raw offsets, including structural delimiters and untranslated code. */
export function extractRawBlocks(text: string): RawBlock[] {
    const lines = [...text.matchAll(/[^\r\n]*(?:\r\n|\n|\r|$)/g)].filter((match) => match[0]);
    // Use the existing Markdown parser's relative list indentation and fence rules.
    // Only its line maps are used: never render or normalize the original bytes.
    const fences = new Map<number, number>();
    for (const token of fenceParser.parse(text, {})) {
        if (token.type === 'fence' && token.map) {
            const [start, end] = token.map;
            // Leave list markers and blockquotes to the existing raw block handling.
            if (/^[ \t]*(`{3,}|~{3,})/.test(lines[start]?.[0] ?? '')) {
                fences.set(start, end);
            }
        }
    }
    const blocks: RawBlock[] = [];
    const content = (index: number) => lines[index][0].replace(/[\r\n]+$/, '');
    const stack: string[] = [];
    const special = (line: string) =>
        /^(?:#{1,6} |\s*{%|\s*\||\s*#\||\s*[-+*] |\s*\d+[.)] |\s*`{3,}|\s*~{3,})/.test(line);
    let index = 0;
    while (index < lines.length) {
        if (!content(index).trim()) {
            index++;
            continue;
        }
        const first = index;
        const line = content(index);
        let kind: RawBlock['kind'] = 'paragraph';
        const fenceEnd = fences.get(index);
        const directive = line.trim().match(/^{%\s*(\w+)(.*?)%}$/);
        let open: string | undefined;
        let close = false;
        if (fenceEnd !== undefined) {
            kind = 'opaque';
            index = fenceEnd;
        } else if (first === 0 && line === '---') {
            kind = 'opaque';
            index++;
            while (index < lines.length && content(index) !== '---') index++;
            if (index < lines.length) index++;
        } else if (directive?.[1] === 'if') {
            // Conditions remain opaque: raw offsets must not cross audience branches.
            kind = 'opaque';
            const delta = (line: string) =>
                [...line.matchAll(/{%\s*(if|endif)\b/g)].reduce(
                    (n, m) => n + (m[1] === 'if' ? 1 : -1),
                    0,
                );
            let depth = delta(line);
            index++;
            while (index < lines.length && depth) {
                depth += delta(content(index));
                index++;
            }
        } else if (directive) {
            kind = 'marker';
            index++;
            if (['note', 'cut', 'list'].includes(directive[1])) {
                open =
                    directive[1] +
                    ':' +
                    (directive[1] === 'cut'
                        ? (directive[2].match(/\d+(?:\.\d+)+/)?.[0] ?? '')
                        : directive[2].trim());
            } else if (directive[1].startsWith('end')) close = true;
        } else if (/^#{1,6} /.test(line)) {
            kind = 'heading';
            index++;
        } else if (/^\s*(?:#\||\|#)\s*$/.test(line)) {
            kind = 'marker';
            index++;
            if (line.trim() === '#|') open = 'table';
            else close = true;
        } else if (/^\s*\|/.test(line)) {
            kind = 'table';
            index++;
        } else if (/^\s*(?:[-+*] |\d+[.)] )/.test(line)) {
            kind = 'list';
            index++;
            while (index < lines.length && content(index).trim() && !special(content(index)))
                index++;
        } else {
            if (/^(?: {4}|\t| {0,3}(?:>|<|\[.*\]:|(?:---|___|\*\*\*)\s*$))/.test(line))
                kind = 'opaque';
            index++;
            while (index < lines.length && content(index).trim() && !special(content(index)))
                index++;
        }
        const start = lines[first].index!;
        const end = lines[index - 1].index! + content(index - 1).length;
        const raw = text.slice(start, end);
        if (raw.includes('{%') && /{%\s*if\b/.test(raw)) kind = 'opaque';
        const anchors = [...raw.matchAll(/\{\s*#([^}\s]+)\s*\}|`([^`\r\n]+)`/g)].map((m) =>
            m[1] ? `id:${m[1]}` : `code:${m[2]}`,
        );
        for (const match of raw.matchAll(/\]\(([^)]+)\)/g)) anchors.push(`link:${match[1]}`);
        for (const match of raw.matchAll(/@[-a-z0-9]+\/[-a-z0-9]+|\bsbr:\d+/gi))
            anchors.push(match[0].startsWith('sbr:') ? 'ref:sbr' : `package:${match[0]}`);
        if (kind === 'marker' && /{%\s*include\b/.test(raw))
            for (const match of raw.matchAll(/\]\(([^)]+)\)/g)) anchors.push(`include:${match[1]}`);
        if (kind === 'marker' && open?.startsWith('cut:') && open !== 'cut:') anchors.push(open);
        blocks.push({start, end, text: raw, kind, anchors, container: [...stack]});
        if (close) stack.pop();
        if (open) stack.push(open);
    }
    return blocks;
}

/** A translation may change prose, but not the raw structural shape. */
export function blockShape(block: RawBlock): string {
    if (block.kind === 'heading') return block.text.match(/^#+/)![0];
    if (block.kind === 'marker' && /{%\s*include\b/.test(block.text)) return 'include';
    if (block.kind === 'marker')
        return block.text
            .replace(/"[^"]*"|'[^']*'/g, '"title"')
            .replace(/\s+/g, ' ')
            .trim();
    if (block.kind === 'table') return 'table:' + (block.text.match(/\|/g)?.length ?? 0);
    if (block.kind === 'list')
        return (
            'list:' +
            (block.text.match(/^\s*/)?.[0].length ?? 0) +
            ':' +
            (/^\s*\d/.test(block.text) ? 'ordered' : 'unordered')
        );
    return block.kind;
}

/** Require complete matching container pairs before inserting a raw fragment. */
export function balancedContainers(text: string): boolean {
    const stack: string[] = [];
    for (const match of text.matchAll(
        /{%\s*(note|cut|list|if|endnote|endcut|endlist|endif)\b[^%]*%}|^\s*(#\||\|#)\s*$/gm,
    )) {
        const name = match[1] ?? match[2];
        if (name.startsWith('end') || name === '|#') {
            if (stack.pop() !== (name === '|#' ? '#|' : name.slice(3))) return false;
        } else stack.push(name);
    }
    return !stack.length;
}
