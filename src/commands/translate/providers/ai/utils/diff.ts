import {lcs, unwrap} from './align';

// Beyond this many words a run is cut: a hint describes an edit, it does
// not restate the paragraph.
const MAX_RUN_WORDS = 12;

// A tag is one token whatever whitespace it carries: an XLIFF placeholder
// (`<x ctype="liquid_Variable" equiv-text="{{ name }}" id="x-1"/>`) split
// into its attributes would outweigh the words around it.
const TOKEN = /<[^<>]*>|[^\s<>]+/g;

/** Words and tags of a unit text without its XLIFF wrapper. */
export function words(text: string): string[] {
    return unwrap(text).match(TOKEN) || [];
}

/** Word counts of a unit text and their total: built once, compared many times. */
export type WordBag = {counts: Map<string, number>; size: number};

export function bag(text: string): WordBag {
    const counts = new Map<string, number>();
    let size = 0;
    for (const word of words(text)) {
        counts.set(word, (counts.get(word) || 0) + 1);
        size++;
    }
    return {counts, size};
}

/**
 * Dice coefficient over two word bags: 1 for equal bags, 0 for disjoint
 * ones. Word order is ignored on purpose - an edited sentence keeps most
 * of its words wherever they moved, and the value only has to tell an
 * edit from a new sentence.
 */
export function bagSimilarity(a: WordBag, b: WordBag): number {
    if (!a.size && !b.size) {
        return 1;
    }
    if (!a.size || !b.size) {
        return 0;
    }

    // Iterate the smaller bag: the intersection is bounded by it.
    const [small, large] = a.counts.size <= b.counts.size ? [a, b] : [b, a];
    let common = 0;
    for (const [word, count] of small.counts) {
        common += Math.min(count, large.counts.get(word) || 0);
    }

    return (2 * common) / (a.size + b.size);
}

/** `bagSimilarity` of two texts. */
export function similarity(a: string, b: string): number {
    return bagSimilarity(bag(a), bag(b));
}

/**
 * Word-level changes from `before` to `after`, one line per changed run:
 * `replaced "a b" with "c"`, `removed "x"`, `inserted "y"`. Runs longer
 * than `MAX_RUN_WORDS` are cut with an ellipsis. Equal texts give no lines.
 */
export function wordChanges(before: string, after: string): string[] {
    const left = words(before);
    const right = words(after);
    const changes: string[] = [];

    let i = 0;
    let j = 0;

    const flush = (nextLeft: number, nextRight: number) => {
        const removed = left.slice(i, nextLeft);
        const inserted = right.slice(j, nextRight);

        if (removed.length && inserted.length) {
            changes.push(`replaced "${cut(removed)}" with "${cut(inserted)}"`);
        } else if (removed.length) {
            changes.push(`removed "${cut(removed)}"`);
        } else if (inserted.length) {
            changes.push(`inserted "${cut(inserted)}"`);
        }
    };

    for (const [a, b] of lcs(left, right)) {
        flush(a, b);
        i = a + 1;
        j = b + 1;
    }
    flush(left.length, right.length);

    return changes;
}

function cut(run: string[]): string {
    if (run.length <= MAX_RUN_WORDS) {
        return run.join(' ');
    }

    return run.slice(0, MAX_RUN_WORDS).join(' ') + ' ...';
}
