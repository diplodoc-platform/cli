import type {RawRange} from './apply';
export type RawBlock = RawRange & {
    text: string;
    kind: 'heading' | 'paragraph' | 'opaque';
    anchors: string[];
    container: string[];
};

/** Conservative raw spans; unsupported containers remain indivisible and opaque. */
export function extractRawBlocks(text: string): RawBlock[] {
    const lines = [...text.matchAll(/[^\r\n]*(?:\r\n|\n|\r|$)/g)].filter((match) => match[0]);
    const blocks: RawBlock[] = [];
    const content = (index: number) => lines[index][0].replace(/[\r\n]+$/, '');
    let index = 0;
    while (index < lines.length) {
        if (!content(index).trim()) {
            index++;
            continue;
        }
        const first = index;
        const line = content(index);
        let kind: RawBlock['kind'] = 'paragraph';
        const fence = line.match(/^ {0,3}(`{3,}|~{3,})/);
        if (fence) {
            kind = 'opaque';
            index++;
            while (index < lines.length) {
                const closing = content(index++).trim();
                if (
                    closing.length >= fence[1].length &&
                    [...closing].every((char) => char === fence[1][0])
                ) {
                    break;
                }
            }
        } else if (first === 0 && line === '---') {
            kind = 'opaque';
            index++;
            while (index < lines.length && content(index) !== '---') {
                index++;
            }
            if (index < lines.length) {
                index++;
            }
        } else if (line.includes('{%')) {
            // Raw condition/preset offsets cannot be inferred from transformed output.
            kind = 'opaque';
            index = lines.length;
        } else if (/^#{1,6} /.test(line)) {
            kind = 'heading';
            index++;
        } else {
            if (
                /^(?: {4}|\t| {0,3}(?:[-+*] |\d+[.)] |>|\||<|\[.*\]:|(?:---|___|\*\*\*)\s*$))/.test(
                    line,
                )
            ) {
                kind = 'opaque';
            }
            index++;
            while (
                index < lines.length &&
                content(index).trim() &&
                !/^#{1,6} |^ {0,3}(?:`{3,}|~{3,})|{%/.test(content(index))
            ) {
                index++;
            }
        }
        const start = lines[first].index!;
        const end = lines[index - 1].index! + content(index - 1).length;
        const raw = text.slice(start, end);
        if (raw.includes('{%') || /\n {0,3}(?:[-+*] |\d+[.)] |>|\|)/.test(raw)) {
            kind = 'opaque';
        }
        const anchors = [...raw.matchAll(/\{\s*#([^}\s]+)\s*\}|`([^`\r\n]+)`/g)].map((match) =>
            match[1] ? `id:${match[1]}` : `code:${match[2]}`,
        );
        blocks.push({start, end, text: raw, kind, anchors, container: []});
    }
    return blocks;
}
