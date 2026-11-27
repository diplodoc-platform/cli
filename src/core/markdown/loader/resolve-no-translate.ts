import type {Token} from '~/core/markdown/parser';
import type {LoaderContext} from '../loader';

import yfmTable from '@diplodoc/transform/plugins/table';

import {MarkdownItConstructor} from '../parser';

type Range = {start: number; end: number; block?: boolean};

type Edit = Range & {replacement: string};

function apply(content: string, edits: Edit[]): string {
    return edits
        .sort((a, b) => b.start - a.start)
        .reduce(
            (text, edit) => text.slice(0, edit.start) + edit.replacement + text.slice(edit.end),
            content,
        );
}

function inlineCodeTokens(tokens: Token[]): Token[] {
    return tokens.flatMap((token) => [
        ...(token.type === 'code_inline' ? [token] : []),
        ...inlineCodeTokens(token.children ?? []),
    ]);
}

function createInlineCapture(md: InstanceType<typeof MarkdownItConstructor>) {
    const rules: unknown = Reflect.get(md.inline.ruler, '__rules__');
    const nativeBackticks = Array.isArray(rules)
        ? rules.find((rule: {name?: string}) => rule.name === 'backticks')?.fn
        : undefined;

    let inlineSource = '';
    let inlineRanges: Range[] = [];
    let inlineUnmapped = false;

    if (typeof nativeBackticks === 'function') {
        md.inline.ruler.at('backticks', (state, silent) => {
            const start = state.pos;
            const matched: boolean = nativeBackticks(state, silent);

            if (matched && !silent) {
                if (state.src === inlineSource) inlineRanges.push({start, end: state.pos});
                else inlineUnmapped = true;
            }

            return matched;
        });
    }

    return (source: string): Range[] | undefined => {
        if (typeof nativeBackticks !== 'function') return undefined;

        inlineSource = source;
        inlineRanges = [];
        inlineUnmapped = false;
        md.inline.parse(source, md, {}, []);

        return inlineUnmapped ? undefined : inlineRanges;
    };
}

function normalizeWithOffsets(content: string) {
    const offsets: number[] = [];
    let normalized = '';

    for (let i = 0; i < content.length; i++) {
        offsets.push(i);
        if (content[i] === '\r') {
            normalized += '\n';
            if (content[i + 1] === '\n') i++;
        } else {
            normalized += content[i] === '\0' ? '\uFFFD' : content[i];
        }
    }

    offsets.push(content.length);
    return {normalized, offsets};
}

function mapInlinePositions(block: string, inline: string): number[] | undefined {
    const positions: number[] = [];
    const blockLines = block.split('\n');
    const inlineLines = inline.split('\n');
    if (inlineLines.length > blockLines.length) return undefined;

    let lineStart = 0;
    for (let line = 0; line < inlineLines.length; line++) {
        const sourceLine = blockLines[line];
        const text = inlineLines[line];
        const column = sourceLine.indexOf(text);
        if (column < 0 || (text && sourceLine.indexOf(text, column + 1) >= 0)) return undefined;

        for (let index = 0; index < text.length; index++)
            positions.push(lineStart + column + index);
        if (line < inlineLines.length - 1) positions.push(lineStart + sourceLine.length);
        lineStart += sourceLine.length + 1;
    }

    return positions;
}

function codeRanges(content: string): Range[] {
    const {normalized, offsets} = normalizeWithOffsets(content);
    const starts = [0];
    for (let i = 0; i < normalized.length; i++) if (normalized[i] === '\n') starts.push(i + 1);

    const ranges: Range[] = [];
    const add = (start: number, end: number, block = false) =>
        ranges.push({start: offsets[start], end: offsets[end], block});
    const md = new MarkdownItConstructor({html: true}).use(yfmTable, {deprecationWarnings: false});

    // Neutralize directive markers only for observation, preserving all offsets. Otherwise an
    // unrecognized opening marker can absorb an immediately following table into a paragraph.
    const observation = normalized.replace(/^ {0,3}:{3}[^\n]*/gm, (line) =>
        ' '.repeat(line.length),
    );
    const tokens = md.parse(observation, {});
    const captureInline = createInlineCapture(md);

    for (const token of tokens) {
        if (!token.map) continue;

        const start = starts[token.map[0]] ?? normalized.length;
        const end = starts[token.map[1]] ?? normalized.length;

        if (token.type === 'fence' || token.type === 'code_block') {
            add(start, end, true);
            continue;
        }
        if (token.type !== 'inline') continue;

        const codeTokens = inlineCodeTokens(token.children ?? []);
        if (!codeTokens.length) continue;

        const positions = mapInlinePositions(observation.slice(start, end), token.content);
        const inlineRanges = captureInline(token.content);
        if (!positions || !inlineRanges || inlineRanges.length !== codeTokens.length) {
            // Keep the mapped lines unchanged when their source positions cannot be proven.
            add(start, end);
            continue;
        }

        for (const range of inlineRanges) {
            add(start + positions[range.start], start + positions[range.end - 1] + 1);
        }
    }

    return ranges;
}

function overlaps(ranges: Range[], start: number, end: number): boolean {
    return ranges.some((range) => start < range.end && end > range.start);
}

export function resolveNoTranslate(this: LoaderContext, content: string) {
    if (this.mode === 'translate' || !content.includes('no-translate')) return content;

    const ranges = codeRanges(content);
    const outputLines: string[] = [];
    const stack: string[] = [];
    let offset = 0;
    let lastLineRemoved = false;

    for (const line of content.split('\n')) {
        lastLineRemoved = false;
        const trimmed = line.trim();
        const start = offset;
        const end = start + line.length;
        offset = end + 1;

        if (!trimmed.startsWith(':::') || overlaps(ranges, start, end)) {
            outputLines.push(line);
            continue;
        }

        if (trimmed === ':::') {
            const name = stack.pop();
            if (name === 'no-translate') lastLineRemoved = true;
            else outputLines.push(line);
        } else {
            const name = /^:::\s*([^\s]+)/.exec(trimmed)?.[1] ?? '';
            stack.push(name);
            if (name === 'no-translate') lastLineRemoved = true;
            else outputLines.push(line);
        }
    }

    if (lastLineRemoved && outputLines.length) {
        const last = outputLines.length - 1;
        if (outputLines[last].endsWith('\r')) outputLines[last] = outputLines[last].slice(0, -1);
    }

    let output = outputLines.join('\n');
    for (const regex of [
        /::\s*no-translate\s*\[([\s\S]*?)\]/g,
        /(?<![:]):no-translate\s*\[([\s\S]*?)\]/g,
    ]) {
        const protectedRanges = codeRanges(output);
        const inlineEdits: Edit[] = [];

        for (const match of output.matchAll(regex)) {
            const start = match.index;
            const end = start + match[0].length;

            if (
                !overlaps(protectedRanges, start, start + 1) &&
                !overlaps(protectedRanges, end - 1, end) &&
                !overlaps(
                    protectedRanges.filter((range) => range.block),
                    start,
                    end,
                )
            )
                inlineEdits.push({start, end, replacement: match[1]});
        }

        output = apply(output, inlineEdits);
    }

    return output;
}
