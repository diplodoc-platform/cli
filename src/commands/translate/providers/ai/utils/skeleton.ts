import type {JSONObject} from '@diplodoc/translation';
import type {Block, BlockPair} from './align';

import {isFenceClose, matchFenceOpen} from '~/core/utils';

import {lineAnchors, linkDestinations, linkPath, replaceLinkDestinations} from './align';
import {untranslatedMarker} from './script';

/**
 * A piece of a translated file that lives in the skeleton, not in the
 * units, and that the translator changed: a fenced code block with
 * localized text, or a line with heading ids of its own or with localized
 * link destinations (a list item that is a link as a whole keeps its
 * destination in the skeleton). A translate run composes the output from
 * the source skeleton, so without the fragment these changes would come
 * back from the source.
 */
export type SkeletonFragment = {
    kind: 'code' | 'line';
    /**
     * The source piece as the seed saw it, placeholders numbered from 0 in
     * order. A line carries the texts of its units too: its ids belong to
     * the heading as written, not to every heading of the same shape.
     */
    source: string;
    /** Which occurrence of `source` in the file the fragment is, from 0. */
    occurrence: number;
    /** What the output takes instead, placeholders numbered as in `source`. */
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
 * the same, and every line that differs carries words of the source
 * script (text to translate) or of the target script (translated text).
 * A block where a command changed is outdated rather than localized, and
 * the source version is right for it.
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
        if (target !== text && localizedCode(text.split('\n'), target.split('\n'), localized)) {
            fragments.push({kind: 'code', source: text, occurrence, target});
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

    return fragments;
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
    const result: RestoredSkeleton = {skeleton, restored: 0, dropped: {code: 0, line: 0}};
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

    for (const fragment of fragments) {
        if (!used.has(fragment)) {
            result.dropped[fragment.kind]++;
        }
    }

    if (!replacements.size) {
        return result;
    }

    const output: string[] = [];
    for (let index = 0; index < lines.length; index++) {
        const replacement = replacements.get(index);
        if (replacement) {
            output.push(...replacement.lines);
            index = replacement.end;
        } else {
            output.push(lines[index]);
        }
    }
    result.skeleton = output.join('\n');

    return result;
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
        result = result.replace(/\s*$/, (tail) => ' ' + extra.join(' ') + tail);
    }

    return result;
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

    return from.every((line, index) => line === to[index] || localized(line, to[index]));
}

type LocalizedLine = (source: string, target: string) => boolean;

/**
 * Whether a changed code line is a translation of the source line: it
 * drops words of the source script or brings words of the target script.
 * Without a script to tell the languages apart (both written in Latin) no
 * change passes: a localized line cannot be told from changed code.
 */
function localizedLine(languages: {source: string; target: string}): LocalizedLine {
    const sourceScript = untranslatedMarker(languages.source, languages.target);
    const targetScript = untranslatedMarker(languages.target, languages.source);

    return (source, target) =>
        Boolean(sourceScript?.test(source)) || Boolean(targetScript?.test(target));
}
