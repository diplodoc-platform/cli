import type {TextPlan} from './types';

import MarkdownIt from 'markdown-it';

import {TranslateError} from '../../utils/errors';

import {planTableAppend} from './table';
import {unwrappedDestination, yfmInlineInventory} from './yfm-units';

type Block = {
    start: number;
    end: number;
    text: string;
    shape: string;
    protectedText: string[];
    verbatimSpans: string[];
    opaque: boolean;
};

type Boundary = {before: number; after: number};
type Edit = {
    first: number;
    end: number;
    start: number;
    stop: number;
    text: string;
    blocks: Block[];
};

export const normalizeEol = (text: string) => text.replace(/\r\n|\r/g, '\n');
const isNamedAnchor = (marker: string) => marker.startsWith('{#') && marker !== '{#T}';

const commonmark = new MarkdownIt({html: true});
commonmark.normalizeLink = (url) => url;
const markdown = new MarkdownIt({html: true});

// The translation API returns XLIFF and a skeleton without source ranges.
// Let markdown-it locate its blocks and reserve indivisible YFM regions
// whose target edits require a dedicated projection rule.
const yfmContainerEnd = new Map([
    ['note', 'endnote'],
    ['cut', 'endcut'],
    ['list', 'endlist'],
    ['tabs', 'endtabs'],
    ['tab', 'endtab'],
    ['if', 'endif'],
    ['for', 'endfor'],
]);
const directiveName = (line: string) => /^{%\s*([a-z]+)\b.*%}[ \t]*$/.exec(line)?.[1];
const yfmDelimiter = (line: string) =>
    line.startsWith('#|') ? '|#' : line.startsWith(':::') && line !== ':::' ? ':::' : undefined;

function conflict(reason: string): never {
    throw new TranslateError(
        'Cannot project changed Markdown: ' + reason,
        'markdown_alignment_conflict',
    );
}

markdown.block.ruler.before(
    'fence',
    'projection_region',
    (state, first, end, silent) => {
        if (state.sCount[first] - state.blkIndent >= 4) {
            return false;
        }
        const lineAt = (index: number) =>
            state.src
                .slice(state.bMarks[index] + state.tShift[index], state.eMarks[index])
                .trimEnd();
        const line = lineAt(first);
        const frontmatter = first === 0 && state.tShift[0] === 0 && line === '---';
        const name = directiveName(line);
        const ending = yfmDelimiter(line) ?? yfmContainerEnd.get(name ?? '');
        if (!frontmatter && !ending && !name) {
            return false;
        }
        if (silent) {
            return true;
        }

        let stop = first + 1;
        if (frontmatter) {
            while (stop < end && (state.tShift[stop] || lineAt(stop) !== '---')) {
                stop++;
            }
            if (stop === end) {
                conflict('unclosed frontmatter');
            }
            stop++;
        } else if (ending) {
            const stack = [ending];
            while (stop < end && stack.length) {
                const fenceEnd = (state.env.fences as Map<number, number>).get(stop);
                if (fenceEnd !== undefined) {
                    stop = fenceEnd;
                    continue;
                }
                const next = lineAt(stop++);
                const command = directiveName(next);
                if ((command ?? next) === stack.at(-1)) {
                    stack.pop();
                } else {
                    const closing =
                        yfmContainerEnd.get(command ?? '') ??
                        (next.startsWith('#|') ? '|#' : undefined);
                    if (closing) {
                        stack.push(closing);
                    }
                }
            }
            if (stack.length) {
                conflict('unclosed Markdown container');
            }
        }

        const token = state.push('projection_region', '', 0);
        token.map = [first, stop];
        state.line = stop;
        return true;
    },
    {alt: ['paragraph', 'reference', 'blockquote', 'list']},
);

function rawLines(document: string) {
    const lines: {start: number; text: string}[] = [];
    let start = 0;
    for (const ending of document.matchAll(/\r\n|[\r\n]/g)) {
        lines.push({start, text: document.slice(start, ending.index)});
        start = ending.index + ending[0].length;
    }
    if (start < document.length) {
        lines.push({start, text: document.slice(start)});
    }
    return lines;
}

function trimLineBreaks(text: string) {
    let start = 0;
    let stop = text.length;
    while (text[start] === '\n') {
        start++;
    }
    while (stop > start && text[stop - 1] === '\n') {
        stop--;
    }
    return text.slice(start, stop);
}

/** Retain raw source offsets, selecting complete native blocks. */
function readBlocks(document: string): Block[] {
    const lines = rawLines(document);
    const normalized = normalizeEol(document);
    const fences = new Map<number, number>();
    if (normalized.includes('{%') || normalized.includes('#|') || normalized.includes(':::')) {
        for (const token of commonmark.parse(normalized, {})) {
            if (token.type === 'fence' && token.map) {
                fences.set(...token.map);
            }
        }
    }
    const tokens = markdown.parse(normalized, {fences});
    const blocks: Block[] = [];
    const items: {first: number; indent: number; marker: string; level: number}[] = [];
    let cursor = 0;
    const indentation = (index: number) =>
        lines[index].text.length - lines[index].text.trimStart().length;
    const emit = (first: number, end: number, kind: string, scope: typeof items = []) => {
        while (first < end && !lines[first].text.trim()) {
            first++;
        }
        while (end > first && !lines[end - 1].text.trim()) {
            end--;
        }
        if (first === end) {
            return;
        }
        const start = lines[first].start;
        const stop = lines[end - 1].start + lines[end - 1].text.length;
        const text = document.slice(start, stop);
        const inline =
            kind === 'opaque' || kind === 'fence'
                ? {
                      protectedText: kind === 'fence' ? [normalizeEol(text)] : [],
                      verbatimSpans: [],
                      opaque: false,
                  }
                : yfmInlineInventory(normalizeEol(text));
        if (inline.opaque) {
            kind = 'opaque';
        }

        const ancestry = scope.map(({indent, marker}) => String(indent) + ':' + marker).join('/');
        blocks.push({
            start,
            end: stop,
            text,
            shape: ancestry + '/' + indentation(first) + '/' + kind,
            protectedText: inline.protectedText,
            verbatimSpans: inline.verbatimSpans,
            opaque: kind === 'opaque',
        });
    };

    for (const token of tokens) {
        const range = token.map;
        if (token.type === 'list_item_close') {
            if (items.at(-1)?.level === token.level) {
                items.pop();
            }
            continue;
        }
        if (!range || token.nesting < 0 || range[0] < cursor) {
            continue;
        }
        if (token.type === 'list_item_open') {
            items.push({
                first: range[0],
                indent: indentation(range[0]),
                marker: token.info + token.markup,
                level: token.level,
            });
            continue;
        }
        if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
            continue;
        }

        const [first, end] = range;
        if (cursor < first) {
            emit(cursor, first, 'opaque');
        }
        const item = items.at(-1);
        const onMarkerLine = item?.first === first;
        let kind = 'opaque';
        if (token.type === 'fence' && !onMarkerLine) {
            const contentLines = token.content.split('\n').length - 1;
            if (contentLines === end - first - 2) {
                kind = 'fence';
            }
        } else if (token.type === 'heading_open' && /^#+$/.test(token.markup) && !onMarkerLine) {
            kind = 'heading:' + token.markup.length;
        } else if (
            token.type === 'paragraph_open' &&
            items.at(-2)?.first !== first &&
            !lines[first].text.slice(0, indentation(first)).includes('\t')
        ) {
            kind = onMarkerLine ? 'item:' + item.marker : 'paragraph';
        }
        emit(first, end, kind, onMarkerLine ? items.slice(0, -1) : items);
        cursor = end;
    }
    if (cursor < lines.length) {
        emit(cursor, lines.length, 'opaque');
    }
    return blocks;
}

const exact = (block: Block) => JSON.stringify([block.shape, normalizeEol(block.text)]);
const identity = (block: Block) =>
    block.protectedText.length ? JSON.stringify([block.shape, block.protectedText]) : undefined;
const compatible = (left: Block, right: Block) =>
    left.shape === right.shape && identity(left) === identity(right);
const sameVerbatim = (left: Block, right: Block) =>
    left.verbatimSpans.length === right.verbatimSpans.length &&
    left.verbatimSpans.every((span, index) => span === right.verbatimSpans[index]);

function uniquePairs(left: Block[], right: Block[], key: (block: Block) => string | undefined) {
    const unique = (blocks: Block[]) => {
        const found = new Map<string, number>();
        for (const [index, block] of blocks.entries()) {
            const id = key(block);
            if (id !== undefined) {
                found.set(id, found.has(id) ? -1 : index);
            }
        }
        return found;
    };
    const rightIndices = unique(right);
    const pairs = new Map<number, number>();
    for (const [id, index] of unique(left)) {
        const target = rightIndices.get(id);
        if (index >= 0 && target !== undefined && target >= 0) {
            pairs.set(index, target);
        }
    }
    return pairs;
}

function gaps(pairs: Map<number, number>, beforeSize: number, afterSize: number) {
    const boundaries: Boundary[] = [
        {before: -1, after: -1},
        ...[...pairs]
            .sort(([left], [right]) => left - right)
            .map(([before, after]) => ({before, after})),
        {before: beforeSize, after: afterSize},
    ];
    return boundaries.slice(1).map((right, index) => {
        const left = boundaries[index];
        if (right.after <= left.after) {
            conflict('block identities cross');
        }
        return {left, right};
    });
}

function correspond(source: Block[], target: Block[]) {
    const matches = uniquePairs(source, target, exact);
    const occupied = new Set(matches.values());
    for (const [from, to] of uniquePairs(source, target, identity)) {
        if (!matches.has(from) && !occupied.has(to)) {
            matches.set(from, to);
        }
    }
    for (const {left, right} of gaps(matches, source.length, target.length)) {
        // Require a verified boundary and exactly one candidate on each side of the comparison.
        if (
            (left.before >= 0 || right.before < source.length) &&
            right.before === left.before + 2 &&
            right.after === left.after + 2 &&
            compatible(source[left.before + 1], target[left.after + 1])
        ) {
            matches.set(left.before + 1, left.after + 1);
        }
    }
    return matches;
}

function sameBlocks(left: Block[], right: Block[]) {
    return (
        left.length === right.length &&
        left.every((block, index) => exact(block) === exact(right[index]))
    );
}

function selectRange(
    source: Block[],
    translated: Block[],
    matches: Map<number, number>,
    start: number,
    end: number,
) {
    const first =
        start === 0 ? 0 : (matches.get(start - 1) ?? conflict('unmapped left boundary')) + 1;
    const stop =
        end === source.length
            ? translated.length
            : (matches.get(end) ?? conflict('unmapped right boundary'));
    return {first, stop};
}

function mappedChanges(blocks: Block[], matches: Map<number, number>, first: number) {
    return blocks.map(
        (_, index) => matches.get(first + index) ?? conflict('unmapped changed block'),
    );
}

function markdownTables(doc: string) {
    const isTable = (block: Block) =>
        block.shape === '/0/opaque' && /^#\|\r?\n/.test(block.text) && /\r?\n\|#$/.test(block.text);
    const tables: {text: string; end: number; scope: string}[] = [];
    for (const block of readBlocks(doc)) {
        if (isTable(block)) {
            tables.push({...block, scope: ''});
        }
        // Look inside a single, unchanged if-branch. Keep its condition as part of
        // the target identity and skip ambiguous else/elsif or unsupported bodies.
        if (
            block.shape !== '/0/opaque' ||
            !block.text.includes('#|') ||
            /^[^\S\r\n]*\{%[^\S\r\n]*(?:else|elsif|elif)\b/m.test(block.text)
        ) {
            continue;
        }
        const wrapped = block.text.startsWith(':::no-translate');
        const opening = wrapped
            ? /^:::no-translate\r?\n(\{%\s*if [^\r\n]+?%\})\r?\n:::\r?\n/
            : /^(\{%\s*if [^\r\n]+?%\})[ \t]*\r?\n/;
        const closing = wrapped
            ? /\r?\n:::no-translate\r?\n\{% endif %\}\r?\n:::$/
            : /\r?\n\{% endif %\}$/;
        const condition = opening.exec(block.text),
            end = closing.exec(block.text)?.index;
        if (!condition || end === undefined) {
            continue;
        }
        let body: Block[];
        try {
            body = readBlocks(block.text.slice(condition[0].length, end));
        } catch {
            continue;
        }
        for (const inner of body.filter(isTable)) {
            tables.push({
                text: inner.text,
                end: block.start + condition[0].length + inner.end,
                scope: condition[1],
            });
        }
    }
    return tables;
}

function noteAutolinkLists(document: string) {
    const lists: Array<{
        kind: string;
        links: {
            start: number;
            end: number;
            path: string;
            prefix: string;
            suffix: string;
            eol: string;
        }[];
    }> = [];
    for (const block of readBlocks(document)) {
        if (block.shape !== '/0/opaque') {
            continue;
        }
        const opening =
            /^(:::no-translate\r?\n)?{%[ \t]+note[ \t]+([a-z]+)\b[^\r\n]*%}[ \t]*\r?\n/.exec(
                document.slice(block.start),
            );
        if (!opening) {
            continue;
        }
        let cursor = block.start + opening[0].length;
        if (opening[1]) {
            const wrapperEnd = /^:::[ \t]*\r?\n/.exec(document.slice(cursor));
            if (!wrapperEnd) {
                continue;
            }
            cursor += wrapperEnd[0].length;
        }
        const blanks = /^(?:[ \t]*\r?\n)*/;
        cursor += blanks.exec(document.slice(cursor))![0].length;
        const row = /([^\r\n]*)(\r?\n)/y;
        row.lastIndex = cursor;
        const links: (typeof lists)[number]['links'] = [];
        for (let match = row.exec(document); match; match = row.exec(document)) {
            const tokens = commonmark.parse(match[1], {});
            if (tokens[0]?.type !== 'bullet_list_open' || tokens.length !== 7) {
                break;
            }
            const link = tokens[3].children;
            if (link?.length !== 3 || link[0].type !== 'link_open' || link[1].content !== '{#T}') {
                break;
            }
            const href = link[0].attrGet('href');
            if (!href) {
                break;
            }
            const start = match[1].lastIndexOf(href);
            const end = start + href.length;
            const rawBefore = match[1].slice(0, start);
            const rawAfter = match[1].slice(end);
            // Derive exact bytes around the parsed destination for target styling.
            if (start < 0 || !rawBefore.endsWith('](') || rawAfter.trimEnd() !== ')') {
                break;
            }
            const {destination, wrapper} = unwrappedDestination(href);
            links.push({
                start: match.index,
                end: row.lastIndex,
                path: destination,
                prefix: rawBefore + (wrapper ? ':no-translate[' : ''),
                suffix: (wrapper ? ']' : '') + rawAfter,
                eol: match[2],
            });
            cursor = row.lastIndex;
        }
        const end = document.slice(cursor + blanks.exec(document.slice(cursor))![0].length);
        if (
            links.length &&
            /^(?:{%[ \t]+endnote[ \t]+%}[ \t]*(?:\r?\n|$)|:::no-translate\r?\n{%[ \t]+endnote[ \t]+%}[ \t]*\r?\n:::[ \t]*(?:\r?\n|$))/.test(
                end,
            )
        ) {
            lists.push({kind: opening[2], links});
        }
    }
    return lists;
}

/** A YFM auto-label derives its name from the linked page and has no prose to translate. */
function planNoteAutolinkAppend(before: string, after: string, target: string) {
    if (!after.includes('[{#T}](')) {
        return null;
    }
    const previousLists = noteAutolinkLists(before);
    for (const updated of noteAutolinkLists(after)) {
        const last = updated.links.at(-1)!;
        for (const previous of previousLists) {
            const added = updated.links.slice(previous.links.length);
            if (
                !added.length ||
                new Set(updated.links.map(({path}) => path)).size !== updated.links.length ||
                after.slice(0, added[0].start) + after.slice(last.end) !== before ||
                previous.links.at(-1)?.end !== added[0].start
            ) {
                continue;
            }
            const anchor = (target: string) => {
                const matches = noteAutolinkLists(target).filter(
                    ({kind, links}) =>
                        kind === previous.kind &&
                        links.length === previous.links.length &&
                        links.every(({path}, index) => path === previous.links[index].path),
                );
                if (matches.length !== 1) {
                    conflict('note link list is missing or ambiguous');
                }
                return matches[0].links.at(-1)!;
            };
            const {end, prefix, suffix, eol} = anchor(target);
            const insertion = added.map(({path}) => prefix + path + suffix + eol).join('');
            const result = target.slice(0, end) + insertion + target.slice(end);
            return {
                input: '',
                apply(translated: string) {
                    if (translated) {
                        conflict('unexpected translation for a structural update');
                    }
                    return result;
                },
            };
        }
    }
    return null;
}

function changedRanges(beforeText: string, afterText: string, before: Block[], after: Block[]) {
    const unchangedWindow = (raw: string, blocks: Block[], first: number, stop: number) =>
        normalizeEol(raw.slice(blocks[first - 1]?.end ?? 0, blocks[stop]?.start ?? raw.length));
    return gaps(uniquePairs(before, after, exact), before.length, after.length)
        .map(({left, right}) => ({
            oldFirst: left.before + 1,
            oldStop: right.before,
            newFirst: left.after + 1,
            newStop: right.after,
        }))
        .filter(({oldFirst, oldStop, newFirst, newStop}) => {
            const removed = before.slice(oldFirst, oldStop);
            const added = after.slice(newFirst, newStop);
            if (!sameBlocks(removed, added)) {
                const removedKeys = new Set(removed.map(exact));
                if (added.some((block) => removedKeys.has(exact(block)))) {
                    conflict('repeated source block within a change');
                }
                if ([...removed, ...added].some((block) => block.opaque)) {
                    conflict('changed Markdown container');
                }

                return true;
            }
            if (
                unchangedWindow(beforeText, before, oldFirst, oldStop) !==
                unchangedWindow(afterText, after, newFirst, newStop)
            ) {
                conflict('source changes separators between unchanged blocks');
            }
            return false;
        });
}

/** Prepare just the changed prose, keeping source offsets for the existing target projector. */

/** Plan changed blocks using source boundaries and independently verified target ranges. */
export function planMarkdown(beforeText: string, afterText: string, targetText: string): TextPlan {
    const table = planTableAppend(beforeText, afterText, targetText, markdownTables);
    if (table) {
        return table;
    }
    const links = planNoteAutolinkAppend(beforeText, afterText, targetText);
    if (links) {
        return links;
    }

    const before = readBlocks(beforeText);
    const after = readBlocks(afterText);
    const target = readBlocks(targetText);
    const matches = correspond(before, target);
    const eol = targetText.match(/\r\n|\r|\n/)?.[0] ?? '\n';
    const sourceRanges = changedRanges(beforeText, afterText, before, after);
    const targetRanges = sourceRanges.map(({oldFirst, oldStop}) => {
        const {first, stop} = selectRange(before, target, matches, oldFirst, oldStop);
        const removed = before.slice(oldFirst, oldStop);
        const indices = mappedChanges(removed, matches, oldFirst);
        if (
            indices.length !== stop - first ||
            indices.some((index, offset) => index !== first + offset)
        ) {
            conflict('target range has extra or displaced blocks');
        }
        for (const [offset, block] of removed.entries()) {
            const current = target[first + offset];
            const namedAnchor =
                block.protectedText.some(isNamedAnchor) && compatible(block, current);
            const verbatim =
                block.verbatimSpans.length &&
                sameVerbatim(block, current) &&
                before.filter((candidate) => sameVerbatim(block, candidate)).length === 1 &&
                target.filter((candidate) => sameVerbatim(block, candidate)).length === 1;
            if (exact(block) !== exact(current) && !namedAnchor && !verbatim) {
                conflict('old target block has no shared identity');
            }
        }
        if (!target.length && targetText !== '') {
            conflict('insertion has no target boundary');
        }
        return {first, stop};
    });

    const pieces: {block: Block; indent: number; text: string}[] = [];
    for (const {newFirst, newStop} of sourceRanges) {
        for (const block of after.slice(newFirst, newStop)) {
            if (block.shape.endsWith('/fence')) {
                continue;
            }
            const lines = normalizeEol(block.text).split('\n');
            const indent = Math.min(...lines.map((line) => line.length - line.trimStart().length));
            const text = lines.map((line) => line.slice(indent)).join('\n');
            const standalone = readBlocks(text);
            if (
                standalone.length !== 1 ||
                standalone[0].shape.split('/').at(-1) !== block.shape.split('/').at(-1)
            ) {
                conflict('changed block cannot be translated outside its enclosing structure');
            }
            if (text.includes('<!-- diplodoc-update-block-')) {
                conflict('reserved block marker');
            }
            pieces.push({block, indent, text});
        }
    }
    const input = pieces
        .map(({text}, index) => (index ? `<!-- diplodoc-update-block-${index} -->\n\n` : '') + text)
        .join('\n\n');

    function apply(translated: string): string {
        if (!input && translated) {
            conflict('unexpected translation for a structural update');
        }
        const parts = normalizeEol(translated).split(
            /^<!-- diplodoc-update-block-(\d+) -->[ \t]*$/m,
        );
        if (pieces.length && parts.length !== pieces.length * 2 - 1) {
            conflict('changed block markers differ');
        }

        let projected = afterText;
        for (let index = pieces.length - 1; index >= 0; index--) {
            if (index && parts[index * 2 - 1] !== String(index)) {
                conflict('changed blocks reordered');
            }
            const part = trimLineBreaks(parts[index * 2]);
            if (!part.trim() || part.includes('<!-- diplodoc-update-block-')) {
                conflict('invalid translated block');
            }
            const {block, indent} = pieces[index];
            const text = part
                .split('\n')
                .map((line) => (line ? ' '.repeat(indent) + line : line))
                .join('\n');
            projected = projected.slice(0, block.start) + text + projected.slice(block.end);
        }
        const proposed = readBlocks(projected);
        if (
            after.length !== proposed.length ||
            after.some((block, index) => !compatible(block, proposed[index]))
        ) {
            conflict('translated blocks changed Markdown structure');
        }
        if (after.some((block, index) => !sameVerbatim(block, proposed[index]))) {
            conflict('translated block modifies a no-translate span');
        }

        const edits: Edit[] = sourceRanges.map(({newFirst, newStop}, index) => {
            const blocks = proposed.slice(newFirst, newStop);
            const {first, stop} = targetRanges[index];
            const next = target[stop];
            const previous = target[first - 1];
            let start = target[first]?.start ?? previous?.end ?? 0;
            let end = target[stop - 1]?.end ?? start;
            let text = blocks.length ? projected.slice(blocks[0].start, blocks.at(-1)!.end) : '';

            if (first === stop && blocks.length) {
                // A pure insertion borrows only the new side of its source separator.
                start = end = next?.start ?? previous?.end ?? 0;
                if (next) {
                    text += projected.slice(blocks.at(-1)!.end, proposed[newStop].start);
                } else if (previous) {
                    text = projected.slice(proposed[newFirst - 1].end, blocks[0].start) + text;
                } else {
                    text = projected;
                }
            } else if (!blocks.length) {
                if (next) {
                    end = next.start;
                } else {
                    start = previous?.end ?? 0;
                }
            }
            return {
                first,
                end: stop,
                start,
                stop: end,
                text: normalizeEol(text).replace(/\n/g, eol),
                blocks,
            };
        });
        let result = targetText;
        const expected = target.slice();
        for (const edit of edits.reverse()) {
            result = result.slice(0, edit.start) + edit.text + result.slice(edit.stop);
            expected.splice(edit.first, edit.end - edit.first, ...edit.blocks);
        }
        if (!sameBlocks(expected, readBlocks(result))) {
            conflict('splice changes adjacent Markdown structure');
        }
        return result;
    }

    // Validate placement and the final block structure before provider work.
    const sourceProjection = apply(input);
    return {
        input,
        apply: input
            ? apply
            : (translated) => {
                  if (translated) {
                      conflict('unexpected translation for a structural update');
                  }
                  return sourceProjection;
              },
    };
}
