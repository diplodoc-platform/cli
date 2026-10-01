import type {JSONObject} from '@diplodoc/translation';
import type {Block, BlockPair} from './align';

import {isFenceClose, matchFenceOpen} from '~/core/utils';

import {lineAnchors, linkDestinations, linkPath, replaceLinkDestinations} from './align';
import {untranslatedMarker} from './script';

/**
 * A piece of a translated file that lives in the skeleton, not in the
 * units, and that the translator changed: a fenced code block with
 * localized text, a line with heading ids of its own or with localized
 * link destinations (a list item that is a link as a whole keeps its
 * destination in the skeleton). A translate run composes the output from
 * the source skeleton, so without the fragment these changes would come
 * back from the source. Approved trailing whitespace and blank-line gaps
 * are kept too, when the source and both neighbors still match the seed.
 */
export type SkeletonFragment = {
    kind: 'code' | 'line' | 'spacing';
    /**
     * The source piece as the seed saw it, placeholders numbered from 0 in
     * order. A line carries the texts of its units too: its ids belong to
     * the heading as written, not to every heading of the same shape.
     */
    source: string;
    /** Which occurrence of `source` in the file the fragment is, from 0. */
    occurrence: number;
    /** Spacing is reused only while the number of equivalent boundaries is unchanged. */
    total?: number;
    /** Replacement with relative placeholders; spacing stores JSON blank lines and trailing space. */
    target: string;
};

export type RestoredSkeleton = {
    skeleton: string;
    restored: number;
    /** Fragments of the file the source no longer has as the seed saw it. */
    dropped: Record<SkeletonFragment['kind'], number>;
};

type Side = {
    units: string[];
    skeleton?: string | JSONObject;
};

type Fence = {start: number; end: number};

const PLACEHOLDER = /%%%(\d+)%%%/g;

/**
 * The text with its placeholders numbered from 0 in order: a piece
 * compares the same wherever it stands in the file. A literal `%%%` of
 * code is not a placeholder and stays as it is.
 */
function relative(text: string): string {
    let index = 0;
    return text.replace(PLACEHOLDER, () => `%%%${index++}%%%`);
}

function placeholders(text: string): number {
    return (text.match(PLACEHOLDER) || []).length;
}

/**
 * The localized skeleton fragments of a translation, see `SkeletonFragment`.
 *
 * Code blocks pair by position: the block that follows the same aligned
 * text block, counted from it, and is followed by text blocks that agree:
 * aligned with each other or both left without a pair (a translation
 * that merged two steps with their code must not pair the first code
 * block with the second). A pair is taken only when it looks like a
 * localization of the same code: the fence lines and the line count are
 * the same, and every line that differs has its text replaced and its
 * code as it is, see `localizedLine`. A block where a command changed is
 * outdated rather than localized, and the source version is right for it.
 *
 * Lines: an aligned block whose line in the translation has heading ids
 * the source line lacks keeps them, after the source ones, and a link
 * destination of the line the translation points to the same page in its
 * language (see `linkRelation`) takes the localized one.
 */
export function skeletonFragments(
    source: Side,
    target: Side,
    blocks: {source: Block[]; target: Block[]; pairs: BlockPair[]},
    languages: {source: string; target: string},
): SkeletonFragment[] {
    if (typeof source.skeleton !== 'string' || typeof target.skeleton !== 'string') {
        return [];
    }

    const sourceLines = source.skeleton.split('\n');
    const targetLines = target.skeleton.split('\n');
    const sourceFences = fencedBlocks(sourceLines);
    const targetFences = fencedBlocks(targetLines);
    const paired = new Map(blocks.pairs);
    const localized = localizedLine(languages);
    const fragments: SkeletonFragment[] = [];
    const linePairs = new Map<number, number>();
    for (const [i, j] of blocks.pairs) {
        const from = blocks.source[i].line;
        const to = blocks.target[j].line;
        if (from !== undefined && to !== undefined) {
            linePairs.set(from, to);
        }
    }

    const byPosition = new Map<string, {fence: Fence; next: number}>();
    positions(targetFences, blocks.target).forEach(({key, next}, k) => {
        byPosition.set(key, {fence: targetFences[k], next});
    });
    const pairedTo = (block: number) => (block < 0 ? -1 : paired.get(block));
    const pairedTargets = new Set(blocks.pairs.map(([, j]) => j));
    // The text blocks after two code blocks agree: paired with each other,
    // or both without a pair (the text around diverged, the code did not).
    const sameNext = (next: number, other: number) => {
        const target = pairedTo(next);
        return target === undefined ? other >= 0 && !pairedTargets.has(other) : target === other;
    };

    const codeOccurrences = new Map<string, number>();
    positions(sourceFences, blocks.source).forEach(({block, ordinal, next}, k) => {
        const fence = sourceFences[k];
        const text = relative(sourceLines.slice(fence.start, fence.end + 1).join('\n'));
        const occurrence = count(codeOccurrences, text);

        const targetBlock = pairedTo(block);
        const other =
            targetBlock === undefined ? undefined : byPosition.get(`${targetBlock}:${ordinal}`);
        if (!other || !sameNext(next, other.next)) {
            return;
        }

        const target = relative(
            targetLines.slice(other.fence.start, other.fence.end + 1).join('\n'),
        );
        if (target === text || localizedCode(text.split('\n'), target.split('\n'), localized)) {
            for (let n = 0; n <= fence.end - fence.start; n++) {
                linePairs.set(fence.start + n, other.fence.start + n);
            }
            if (target !== text) {
                fragments.push({kind: 'code', source: text, occurrence, target});
            }
        }
    });

    const insideSource = insideFences(sourceFences);
    const insideTarget = insideFences(targetFences);
    const lineOccurrences = new Map<string, number>();
    const occurrenceOf = new Map<number, number>();
    blocks.source.forEach((block, i) => {
        if (block.line !== undefined && !insideSource.has(block.line)) {
            const key = lineKey(sourceLines[block.line], block.units, source.units);
            occurrenceOf.set(i, count(lineOccurrences, key));
        }
    });

    const links = [languages.source, languages.target];
    for (const [i, j] of blocks.pairs) {
        const from = blocks.source[i];
        const to = blocks.target[j];
        if (
            from.line === undefined ||
            to.line === undefined ||
            insideSource.has(from.line) ||
            insideTarget.has(to.line)
        ) {
            continue;
        }

        const line = sourceLines[from.line];
        const localizedLine = localizeLine(line, targetLines[to.line], links);
        if (localizedLine !== line) {
            fragments.push({
                kind: 'line',
                source: lineKey(line, from.units, source.units),
                occurrence: occurrenceOf.get(i) as number,
                target: relative(localizedLine),
            });
        }
    }

    fragments.push(
        ...spacingFragments(
            sourceLines,
            source.units,
            targetLines,
            linePairs,
            insideSource,
            insideTarget,
        ),
    );

    return fragments;
}

/** Keeps only blank-line gaps whose original source boundaries still match. */
function spacingFragments(
    sourceLines: string[],
    units: string[],
    targetLines: string[],
    linePairs: Map<number, number>,
    insideSource: Set<number>,
    insideTarget: Set<number>,
): SkeletonFragment[] {
    const fragments: SkeletonFragment[] = [];
    pairLiteralLines(sourceLines, targetLines, linePairs, insideSource, insideTarget);

    const spacingOccurrences = new Map<string, number>();
    const gaps = whitespaceGaps(sourceLines, insideSource);
    const totals = spacingTotals(sourceLines, units, gaps);
    for (const gap of gaps) {
        if (insideSource.has(gap.start)) {
            continue;
        }
        const key = spacingKey(sourceLines, units, gap);
        const identity = spacingIdentity(key);
        const occurrence = count(spacingOccurrences, identity);
        const target = translatedSpacing(sourceLines, targetLines, linePairs, gap);
        if (!target) {
            continue;
        }
        fragments.push({
            kind: 'spacing',
            source: key,
            occurrence,
            total: totals.get(identity),
            target: JSON.stringify(target),
        });
    }

    return fragments;
}

function pairLiteralLines(
    sourceLines: string[],
    targetLines: string[],
    linePairs: Map<number, number>,
    insideSource: Set<number>,
    insideTarget: Set<number>,
): void {
    // Literal directives between aligned text/code anchors also delimit gaps.
    const anchors = [[-1, -1], ...linePairs, [sourceLines.length, targetLines.length]].sort(
        ([a], [b]) => a - b,
    );
    const literals = (lines: string[], start: number, end: number, inside: Set<number>) => {
        const result: {index: number; line: string}[] = [];
        for (let index = start + 1; index < end; index++) {
            const line = lines[index];
            if (line.trim() && !/%%%\d+%%%/.test(line) && !inside.has(index)) {
                result.push({index, line});
            }
        }
        return result;
    };
    for (let k = 1; k < anchors.length; k++) {
        const [start, targetStart] = anchors[k - 1];
        const [end, targetEnd] = anchors[k];
        if (targetStart >= targetEnd) {
            continue;
        }
        const from = literals(sourceLines, start, end, insideSource);
        const to = literals(targetLines, targetStart, targetEnd, insideTarget);
        if (from.length === to.length && from.every(({line}, n) => line === to[n].line)) {
            from.forEach(({index}, n) => linePairs.set(index, to[n].index));
        }
    }
}

type TranslatedSpacing = {lines: string[]; trailing?: string};

function translatedSpacing(
    sourceLines: string[],
    targetLines: string[],
    linePairs: Map<number, number>,
    gap: WhitespaceGap,
): TranslatedSpacing | undefined {
    const before = gap.start === 0 ? -1 : linePairs.get(gap.start - 1);
    const after = gap.end === sourceLines.length ? targetLines.length : linePairs.get(gap.end);
    if (before === undefined || after === undefined || before >= after) {
        return undefined;
    }
    const lines = targetLines.slice(before + 1, after);
    const trailing = before < 0 ? undefined : trailingSpace(targetLines[before]);
    const originalTrailing =
        gap.start === 0 ? undefined : trailingSpace(sourceLines[gap.start - 1]);
    if (
        lines.some((line) => line.trim()) ||
        (JSON.stringify(lines) === JSON.stringify(gap.lines) && trailing === originalTrailing)
    ) {
        return undefined;
    }
    return {lines, trailing};
}

/**
 * Puts the recorded fragments of a file back into the skeleton of its
 * source. A fragment applies where the source still has the piece it was
 * taken from, at the same occurrence; its placeholders take the numbers
 * of that piece in order. A copy of a code block the source added after
 * the recorded ones takes the localization of the last of them: the same
 * code reads the same in the translation. A line is not copied, its
 * heading ids must stay unique. A fragment no piece of the source took
 * is dropped: the source changed or removed the piece, and the output
 * follows the source there.
 */
export function restoreFragments(
    skeleton: string,
    units: string[],
    fragments: SkeletonFragment[],
): RestoredSkeleton {
    const result: RestoredSkeleton = {
        skeleton,
        restored: 0,
        dropped: {code: 0, line: 0, spacing: 0},
    };
    if (!fragments.length) {
        return result;
    }

    const lines = skeleton.split('\n');
    const fences = fencedBlocks(lines);
    const inside = insideFences(fences);
    const byKey = new Map(fragments.map((fragment) => [fragmentKey(fragment), fragment] as const));
    const lastCode = new Map<string, SkeletonFragment>();
    for (const fragment of fragments) {
        const last = lastCode.get(fragment.source);
        if (fragment.kind === 'code' && (!last || fragment.occurrence > last.occurrence)) {
            lastCode.set(fragment.source, fragment);
        }
    }
    const used = new Set<SkeletonFragment>();
    const occurrences = new Map<string, number>();
    const replacements = new Map<number, {end: number; lines: string[]}>();

    const apply = (kind: SkeletonFragment['kind'], text: string, start: number, end: number) => {
        const occurrence = count(occurrences, JSON.stringify([kind, text]));
        let fragment = byKey.get(fragmentKey({kind, source: text, occurrence}));
        const last = kind === 'code' ? lastCode.get(text) : undefined;
        if (!fragment && last && occurrence > last.occurrence) {
            fragment = last;
        }
        if (!fragment) {
            return;
        }

        const original = lines.slice(start, end + 1).join('\n');
        const ids = Array.from(original.matchAll(PLACEHOLDER), (match) => match[1]);
        if (placeholders(fragment.target) !== ids.length) {
            return;
        }

        const target = fragment.target.replace(
            PLACEHOLDER,
            (_, n: string) => `%%%${ids[Number(n)]}%%%`,
        );
        replacements.set(start, {end, lines: target.split('\n')});
        used.add(fragment);
        result.restored++;
    };

    for (const fence of fences) {
        const text = relative(lines.slice(fence.start, fence.end + 1).join('\n'));
        apply('code', text, fence.start, fence.end);
    }

    lines.forEach((line, index) => {
        const ids = Array.from(line.matchAll(PLACEHOLDER), (match) => Number(match[1]));
        if (ids.length && !inside.has(index)) {
            apply('line', lineKey(line, ids, units), index, index);
        }
    });

    const {spacing, trailing, restored} = restoreSpacingFragments(lines, units, inside, byKey);
    for (const fragment of restored) {
        used.add(fragment);
    }
    result.restored += restored.length;

    for (const fragment of fragments) {
        if (!used.has(fragment)) {
            result.dropped[fragment.kind]++;
        }
    }

    if (!replacements.size && !spacing.size) {
        return result;
    }

    result.skeleton = assembleSkeleton(lines, replacements, spacing, trailing);

    return result;
}

function restoreSpacingFragments(
    lines: string[],
    units: string[],
    inside: Set<number>,
    byKey: Map<string, SkeletonFragment>,
) {
    const spacing = new Map<number, {end: number; lines: string[]}>();
    const trailing = new Map<number, string>();
    const restored: SkeletonFragment[] = [];
    const occurrences = new Map<string, number>();
    const gaps = whitespaceGaps(lines, inside);
    const totals = spacingTotals(lines, units, gaps);
    for (const gap of gaps) {
        if (inside.has(gap.start)) {
            continue;
        }
        const source = spacingKey(lines, units, gap);
        const identity = spacingIdentity(source);
        const occurrence = count(occurrences, JSON.stringify(['spacing', identity]));
        const fragment = byKey.get(fragmentKey({kind: 'spacing', source, occurrence}));
        if (fragment && fragment.total === totals.get(identity)) {
            const target = JSON.parse(fragment.target) as TranslatedSpacing;
            spacing.set(gap.start, {end: gap.end, lines: target.lines});
            if (gap.start > 0 && target.trailing !== undefined) {
                trailing.set(gap.start - 1, target.trailing);
            }
            restored.push(fragment);
        }
    }
    return {spacing, trailing, restored};
}

function assembleSkeleton(
    lines: string[],
    replacements: Map<number, {end: number; lines: string[]}>,
    spacing: Map<number, {end: number; lines: string[]}>,
    trailing: Map<number, string>,
): string {
    const output: string[] = [];
    let index = 0;
    while (index <= lines.length) {
        const gap = spacing.get(index);
        if (gap) {
            output.push(...gap.lines);
            index = gap.end;
        }
        if (index === lines.length) {
            break;
        }
        const replacement = replacements.get(index);
        if (replacement) {
            const restored = [...replacement.lines];
            if (trailing.has(replacement.end)) {
                const last = restored.length - 1;
                restored[last] = restored[last].trimEnd() + trailing.get(replacement.end);
            }
            output.push(...restored);
            index = replacement.end + 1;
        } else {
            output.push(
                trailing.has(index) ? lines[index].trimEnd() + trailing.get(index) : lines[index],
            );
            index++;
        }
    }
    return output.join('\n');
}

function fragmentKey({kind, source, occurrence}: Omit<SkeletonFragment, 'target'>): string {
    return JSON.stringify([kind, source, occurrence]);
}

/**
 * The source line with what the translation localized in it: the link
 * destinations of the translated line when they lead to the same pages in
 * the same order (see `linkPath`), and heading ids only the translation
 * has, after the source ones.
 */
function localizeLine(line: string, other: string, languages: string[]): string {
    const from = linkDestinations(line);
    const to = linkDestinations(other);
    const same =
        from.length === to.length &&
        from.every((url, k) => linkPath(url, languages) === linkPath(to[k], languages));
    let index = 0;
    let result = same ? replaceLinkDestinations(line, () => to[index++]) : line;

    const own = new Set(lineAnchors(line).anchors.map(({id}) => id));
    const extra = lineAnchors(other)
        .anchors.filter(({id}) => !own.has(id))
        .map(({text}) => text);
    if (extra.length) {
        const body = result.trimEnd();
        result = body + ' ' + extra.join(' ') + result.slice(body.length);
    }

    return result;
}

type WhitespaceGap = {
    start: number;
    end: number;
    lines: string[];
    context: string[];
    before?: string[];
    after?: string[];
};

/** Gaps between nonblank lines, including empty gaps and the file boundaries. */
function whitespaceGaps(lines: string[], inside: Set<number>): WhitespaceGap[] {
    const gaps: WhitespaceGap[] = [];
    let start = 0;
    const headings: string[] = [];
    const cuts: string[] = [];
    const boundaries = new Map<number, string[]>();
    for (const fence of fencedBlocks(lines)) {
        const block = lines.slice(fence.start, fence.end + 1);
        boundaries.set(fence.start, block);
        boundaries.set(fence.end, block);
    }
    for (let index = 0; index <= lines.length; index++) {
        if (index === lines.length || lines[index].trim()) {
            gaps.push({
                start,
                end: index,
                lines: lines.slice(start, index),
                context: [...cuts, ...headings.filter(Boolean)],
                before: boundaries.get(start - 1),
                after: boundaries.get(index),
            });
            start = index + 1;
            if (index < lines.length && !inside.has(index)) {
                const line = lines[index];
                if (/^\s*{%\s*cut\b/.test(line)) {
                    cuts.push(line);
                    headings.length = 0;
                } else if (/^\s*{%\s*endcut\b/.test(line)) {
                    cuts.pop();
                    headings.length = 0;
                } else if (/^ {0,3}#{1,6}\s/.test(line)) {
                    const level = (/^#+/.exec(line.trimStart()) as RegExpExecArray)[0].length;
                    headings.length = level;
                    headings[level - 1] = line;
                }
            }
        }
    }
    return gaps;
}

/** Both unchanged neighbors and the original gap must match before spacing is reused. */
function spacingKey(lines: string[], units: string[], gap: WhitespaceGap): string {
    const key = (index: number, block?: string[]) => {
        if (index < 0 || index >= lines.length) {
            return null;
        }
        const line = block ? block.join('\n') : lines[index];
        const ids = Array.from(line.matchAll(PLACEHOLDER), (match) => Number(match[1]));
        return lineKey(line, ids, units);
    };
    const context = gap.context.map((line) => {
        const ids = Array.from(line.matchAll(PLACEHOLDER), (match) => Number(match[1]));
        return lineKey(line, ids, units);
    });
    return JSON.stringify([
        key(gap.start - 1, gap.before),
        gap.lines,
        key(gap.end, gap.after),
        context,
    ]);
}

/** A boundary keeps its occurrence identity even when its gap is edited. */
function spacingIdentity(key: string): string {
    const [before, , after, context] = JSON.parse(key);
    const boundary = (key: string | null) => {
        if (key === null) {
            return null;
        }
        const [line, ...units] = JSON.parse(key);
        return [line.trimEnd(), ...units];
    };
    return JSON.stringify([boundary(before), boundary(after), context.map(boundary)]);
}

function trailingSpace(line: string): string {
    return line.slice(line.trimEnd().length);
}

function spacingTotals(
    lines: string[],
    units: string[],
    gaps: WhitespaceGap[],
): Map<string, number> {
    const totals = new Map<string, number>();
    for (const gap of gaps) {
        count(totals, spacingIdentity(spacingKey(lines, units, gap)));
    }
    return totals;
}

function lineKey(line: string, ids: number[], units: string[]): string {
    return JSON.stringify([relative(line), ...ids.map((id) => units[id] ?? '')]);
}

/** The next occurrence number of `key`, counting it. */
function count(counts: Map<string, number>, key: string): number {
    const value = counts.get(key) || 0;
    counts.set(key, value + 1);
    return value;
}

/** Closed fenced code blocks of a skeleton, fence lines included. */
function fencedBlocks(lines: string[]): Fence[] {
    const result: Fence[] = [];
    let open: {start: number; markup: string} | null = null;

    lines.forEach((line, index) => {
        const trimmed = line.trimStart();
        if (open) {
            if (isFenceClose(trimmed, open.markup)) {
                result.push({start: open.start, end: index});
                open = null;
            }
            return;
        }

        const fence = matchFenceOpen(trimmed);
        if (fence) {
            open = {start: index, markup: fence.markup};
        }
    });

    return result;
}

function insideFences(fences: Fence[]): Set<number> {
    const result = new Set<number>();
    for (const {start, end} of fences) {
        for (let index = start; index <= end; index++) {
            result.add(index);
        }
    }
    return result;
}

/**
 * The position of every code block: the index of the last text block
 * above it (-1 at the top of the file) and how many code blocks follow
 * that text block before this one.
 */
function positions(
    fences: Fence[],
    blocks: Block[],
): {block: number; ordinal: number; key: string; next: number}[] {
    const lines = blocks
        .map((block, index) => [block.line, index] as const)
        .filter((entry): entry is readonly [number, number] => entry[0] !== undefined);
    const ordinals = new Map<string, number>();
    let cursor = 0;
    let block = -1;

    return fences.map((fence) => {
        while (cursor < lines.length && lines[cursor][0] < fence.start) {
            block = lines[cursor][1];
            cursor++;
        }
        const after = lines.find(([line]) => line > fence.end);
        const ordinal = count(ordinals, String(block));
        return {block, ordinal, key: `${block}:${ordinal}`, next: after ? after[1] : -1};
    });
}

/**
 * Whether the translation of a code block differs from the source by
 * localized lines only: same fence lines, same line and placeholder
 * counts, and every changed line a translation of its source line.
 */
function localizedCode(from: string[], to: string[], localized: LocalizedLine): boolean {
    if (from.length !== to.length) {
        return false;
    }
    if (from[0] !== to[0] || from[from.length - 1] !== to[to.length - 1]) {
        return false;
    }
    if (placeholders(from.join('\n')) !== placeholders(to.join('\n'))) {
        return false;
    }

    const markers = commentMarkers(from[0]);

    return from.every((line, index) => line === to[index] || localized(line, to[index], markers));
}

type LocalizedLine = (source: string, target: string, markers: CommentMarkers) => boolean;

/** Comment markers of a code block. */
type CommentMarkers = {
    /** A marker at the start of a line, with the space after it. */
    line: RegExp;
    /** A marker after code, with the spaces around it. */
    after: RegExp;
    /** Whether a `#` or `%` line may be a prompt (`# rm -rf /`, `% ls`). */
    prompts: boolean;
};

// Comment markers by language: shells read `--` and `%` as code
// (`kubectl exec pod -- ls`, a `%` prompt) and Python reads `//` as code
// (`total // 2`); SQL dialects start their comments with `--`. A block
// of another language takes `#` and `//`, and at the start of a line `/*`
// (`/** Get the state. */`), `--`, `%` and `;` too. A prompt is at home in
// a shell block, a shell session and a block without a language.
const SHELLS = new Set([
    'bash',
    'sh',
    'shell',
    'zsh',
    'fish',
    'ksh',
    'console',
    'powershell',
    'ps1',
]);
const SESSIONS = new Set([
    '',
    'text',
    'txt',
    'plaintext',
    'no-highlight',
    'terminal',
    'cmd',
    'bat',
]);
const HASHES = new Set([
    'python',
    'python3',
    'py',
    'ruby',
    'rb',
    'perl',
    'pl',
    'r',
    'yaml',
    'yml',
    'toml',
    'ini',
    'cfg',
    'conf',
    'properties',
    'nginx',
    'dockerfile',
    'makefile',
    'cmake',
    'awk',
]);
const DASHES = new Set([
    'sql',
    'yql',
    'lua',
    'haskell',
    'hs',
    'plsql',
    'psql',
    'mysql',
    'postgresql',
]);

function commentMarkers(fence: string): CommentMarkers {
    const language = fence
        .trim()
        .replace(/^[`~]+/, '')
        .trim()
        .split(/\s/)[0]
        .toLowerCase();
    const session = /-?session$/.test(language);
    if (SHELLS.has(language) || session) {
        return {line: /^\s*(#+) /, after: / (#+) /g, prompts: true};
    }
    if (HASHES.has(language)) {
        return {line: /^\s*(#+) /, after: / (#+) /g, prompts: false};
    }
    if (DASHES.has(language)) {
        return {line: /^\s*(--+|#+|\/\/+|\/\*+) /, after: / (--+|#+) /g, prompts: false};
    }

    return {
        line: /^\s*(#+|\/\/+|\/\*+|--+|%+|;+) /,
        after: / (#+|\/\/+) /g,
        prompts: SESSIONS.has(language),
    };
}

/**
 * Whether a changed code line is a translation of the source line: the
 * text in the source script replaced, the code around it as it is, see
 * `textReplaced`. When the source is written in the script of code (en to
 * ru), the text in the target script is what the translation put in place
 * of the source text. Without a script to tell the languages apart (both
 * written in Latin) no change passes: a localized line cannot be told from
 * changed code.
 */
function localizedLine(languages: {source: string; target: string}): LocalizedLine {
    const sourceScript = untranslatedMarker(languages.source, languages.target);
    const targetScript = untranslatedMarker(languages.target, languages.source);

    return (source, target, markers) =>
        (sourceScript !== null && textReplaced(source, target, sourceScript, markers)) ||
        (targetScript !== null && textReplaced(target, source, targetScript, markers));
}

// A line that may be a prompt in a shell block: `# reboot`, `% ls`.
const PROMPT_LINE = /^\s*[#%] /;
// Prose: letters, numbers, spaces, punctuation of text and an apostrophe
// inside a word (`user's`); no quotes, `$`, `;`, `|`, `&`, `<`, `=` or
// other characters that make code.
const PROSE_CHARACTER = String.raw`[\p{L}\p{N}\s,.:!?’«»()–—%/+-]`;
const PROSE = String.raw`(?:${PROSE_CHARACTER}|(?<=\p{L})'(?=\p{L}))`;
const PROSE_TEXT = new RegExp(`^${PROSE}*$`, 'u');
// What may join two words of a text: spaces, numbers and punctuation, not
// a word of another script (`AS name AS` between two aliases is code).
const TEXT_GAP = /^[\p{N}\s,.:!?’«»()–—%/+-]*$/u;
// A string without escapes.
const QUOTED = /"[^"\\\n]*"|'[^'\\\n]*'/g;

/**
 * Whether `other` is `line` with its text in the script replaced, the code
 * around it as it is. The text of a comment is free, the code before it has
 * to stay (`yt list //home # Список` for `yt list //home # List`, not for
 * `yt ls //home # List`). A `#` or `%` line of a shell or a block without
 * a language may be a prompt on either side (`# Привет` and `# reboot`): a
 * changed one is not told from changed code and is not localized. Elsewhere the text is replaced, see
 * `replacement` (`echo "Привет"` for `echo "Hello"`, not for `rm -rf /`,
 * `printf "Hello"` or `echo "$(date)"`): the words of the script with the
 * spaces and punctuation between them, or the whole text of a string that
 * has them (`"Id владельца"` for `"Owner ID"`).
 */
function textReplaced(
    line: string,
    other: string,
    script: RegExp,
    markers: CommentMarkers,
): boolean {
    if (markers.prompts && PROMPT_LINE.test(line)) {
        return false;
    }

    const comment = commentText(line, markers, script);
    if (comment) {
        const code = line.slice(0, comment[0]);
        const rest = line.slice(comment[1]);

        return (
            other.length > code.length + rest.length &&
            other.startsWith(code) &&
            other.endsWith(rest)
        );
    }

    const spans = textSpans(line, script);
    if (!spans.length) {
        return false;
    }

    // A line of text alone has no code to take along: a word may become
    // more words (`Вход` for `Sign in`).
    const [first] = spans;
    const alone =
        spans.length === 1 && !line.slice(0, first.start).trim() && !line.slice(first.end).trim();
    let pattern = '';
    let last = 0;
    for (const {start, end, quote} of spans) {
        pattern +=
            escapeRegExp(line.slice(last, start)) +
            replacement(line.slice(start, end), quote, alone);
        last = end;
    }
    pattern += escapeRegExp(line.slice(last));

    return new RegExp(`^${pattern}$`, 'u').test(other);
}

/**
 * Where the text of a line comment starts and ends, undefined without one:
 * after a marker at the start of the line, up to the end of a block comment
 * that code follows on the line, or after the last marker before the text
 * whose code has all its quotes closed (`x = a // 2  # Половина`, not
 * `curl -H "X-Tag: # Тест"`).
 */
function commentText(
    line: string,
    markers: CommentMarkers,
    script: RegExp,
): [number, number] | undefined {
    const text = line.search(script);
    if (text < 0) {
        return undefined;
    }

    const whole = markers.line.exec(line);
    if (whole) {
        const start = whole[0].length;
        const close = whole[1].startsWith('/*') ? line.indexOf('*/', start) : -1;
        return [start, close < 0 ? line.length : close];
    }

    const ends = [...line.matchAll(markers.after)]
        .filter(({index}) => {
            const code = line.slice(0, index);
            return index < text && code.trim() !== '' && closedQuotes(code);
        })
        .map(({index, 0: marker}) => index + marker.length);

    return ends.length ? [Math.max(...ends), line.length] : undefined;
}

function closedQuotes(code: string): boolean {
    return ['"', "'", '`'].every((quote) => code.split(quote).length % 2 === 1);
}

/** A span of text; `quote` is the quote of a string that is text as a whole. */
type Span = {start: number; end: number; quote?: string};

/** Spans of the text in the script, see `textReplaced`. */
function textSpans(line: string, script: RegExp): Span[] {
    const word = new RegExp(String.raw`(?:${script.source})(?:${script.source}|[\p{N}_’-])*`, 'gu');
    let spans: Span[] = [];
    for (const match of line.matchAll(word)) {
        const start = match.index;
        const end = start + match[0].length;
        const previous = spans[spans.length - 1];
        if (previous && TEXT_GAP.test(line.slice(previous.end, start))) {
            previous.end = end;
        } else {
            spans.push({start, end});
        }
    }

    for (const quoted of line.matchAll(QUOTED)) {
        const from = quoted.index + 1;
        const to = quoted.index + quoted[0].length - 1;
        const inside = spans.filter(({start, end}) => start >= from && end <= to);
        if (inside.length && textString(line.slice(from, to), script)) {
            spans = spans
                .filter((span) => !inside.includes(span))
                .concat([{start: from, end: to, quote: quoted[0][0]}]);
        }
    }

    return spans.sort((a, b) => a.start - b.start);
}

/**
 * Whether the text of a string is text as a whole: prose with no word in
 * another script (`"Полнота данных"`). A word in another script may be code
 * (`"SELECT Имя FROM сотрудники"`), and a translation cannot tell which of
 * its words stand for it: such a string keeps them where they are.
 */
function textString(text: string, script: RegExp): boolean {
    const others = text.replace(new RegExp(script.source, 'gu'), '');

    return PROSE_TEXT.test(text) && !/\p{L}/u.test(others);
}

/**
 * What may stand in place of a text: prose without the quote for the text
 * of a string, otherwise words with the spaces and punctuation the text has
 * (`Исправление` for `Fix`, `поэлементно` for `element-wise`, not for
 * `Fix --amend`; `Проекты` not for `Projects Archive`, another argument),
 * with any spaces for a line of text alone.
 */
function replacement(text: string, quote: string | undefined, alone: boolean): string {
    if (quote) {
        return (quote === "'" ? PROSE_CHARACTER : PROSE) + '+?';
    }

    const marks = [...new Set(text.replace(/[\p{L}\p{N}]/gu, '') + (alone ? ' ' : ''))]
        .join('')
        .replace(/[\\\][^-]/g, String.raw`\$&`);

    return String.raw`(?:[\p{L}\p{N}${marks}]|(?<=\p{L})-(?=\p{L}))+?`;
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\/]/g, String.raw`\$&`);
}
