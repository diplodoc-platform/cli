/**
 * Repairs markdown emphasis that a model adds to a fragment on its own.
 *
 * `extract` never leaves emphasis markers inside a translation unit. An
 * emphasis contained in the fragment travels as a `<g>` tag, and one that
 * starts (or ends) outside of it leaves an `<x ctype="bold_close"/>` tag
 * with the marker itself in the skeleton:
 *
 * ```
 * **Release date:** 2026-08-25
 *   skeleton: **%%%0%%%
 *   unit:     Release date:<x ctype="bold_close" equiv-text="**" id="x-1"/> 2026-08-25
 * ```
 *
 * A model does not know that: it sees a fragment that reads like a bold
 * label and puts the markers back on its own. `compose` then glues the
 * skeleton marker to the invented one and the line renders as
 * `****Release date:** 2026-08-25`.
 *
 * The invented markers are cut back off in the three cases where the
 * source fragment proves them redundant:
 *
 * - the skeleton restores that very marker at that edge (a hoisted
 *   `<x .../>` tag), so the marker the model paired with it inside the
 *   fragment takes over as the delimiter;
 * - the fragment carries no emphasis at all and the model wrapped it whole;
 * - the marker sits at an edge the source fragment leaves free and has no
 *   partner left, e.g. because its opening one was cut as a duplicate.
 *
 * A marker a model wrote instead of a `<g>` tag it lost is the only
 * emphasis left in the fragment and has to survive.
 */

/** Markdown emphasis delimiter run: `*`, `**`, `***` or the `_` flavour. */
const RUN = String.raw`\*{1,3}|_{1,3}`;

/** Delimiter run opening emphasis at the very start of the text. */
const OPEN_RUN = new RegExp(String.raw`^(${RUN})(?=[^\s*_])`);

/** Delimiter run closing emphasis at the very end of the text. */
const CLOSE_RUN = new RegExp(String.raw`(?<=[^\s*_])(${RUN})$`);

/** Every delimiter run of the text, used to recognize a plain wrapping. */
const ANY_RUN = new RegExp(RUN, 'g');

/** Whole string is a delimiter run, used to tell emphasis tags from the rest. */
const ONLY_RUN = new RegExp(String.raw`^(?:${RUN})$`);

/** Any inline tag, and an inline tag right at a text edge. */
const TAG = /<[^>]+>/g;
const LEADING_TAG = /^<[^>]+>/;
const TRAILING_TAG = /<[^>]+>$/;

/** Self-closing tag of markup hoisted into the skeleton, with its marker. */
const HOISTED_TAG = /<x\b[^>]*\/>/g;

/** Opening tag of markup contained in the fragment, with its markers. */
const CONTAINED_TAG = /<g\b[^>]*>/g;

/** Marker run glued to a hoisted tag, on either side of it. */
const HOISTED_EDGE = new RegExp(String.raw`(${RUN})?(<x\b[^>]*\/>)(${RUN})?`, 'g');

export type EmphasisRepair = {
    text: string;
    /** Number of delimiter runs removed from the translation. */
    stripped: number;
};

function attr(tag: string, name: string): string | undefined {
    return new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];
}

/**
 * Markers the skeleton restores around the fragment: `close` tags mean the
 * emphasis opened before the fragment, `open` tags mean it closes after it.
 */
function hoistedMarkers(source: string, edge: 'open' | 'close'): Set<string> {
    const markers = new Set<string>();

    for (const [tag] of source.matchAll(HOISTED_TAG)) {
        const ctype = attr(tag, 'ctype');
        const equiv = attr(tag, 'equiv-text');

        if (equiv && ONLY_RUN.test(equiv) && ctype?.endsWith(`_${edge}`)) {
            markers.add(equiv);
        }
    }

    return markers;
}

/** Emphasis markers of the fragment's own `<g>` tags. */
function containedMarkers(source: string): Set<string> {
    const markers = new Set<string>();

    for (const [tag] of source.matchAll(CONTAINED_TAG)) {
        for (const name of ['x-begin', 'x-end']) {
            const marker = attr(tag, name);

            if (marker && ONLY_RUN.test(marker)) {
                markers.add(marker);
            }
        }
    }

    return markers;
}

/**
 * Tells whether the source fragment has no emphasis of its own at that
 * edge, neither a marker nor a tag, so a marker the model put there was
 * not in the fragment it was given.
 */
function isFreeEdge(source: string, edge: 'open' | 'close'): boolean {
    return edge === 'close'
        ? !OPEN_RUN.test(source) && !LEADING_TAG.test(source)
        : !CLOSE_RUN.test(source) && !TRAILING_TAG.test(source);
}

/**
 * Tells whether the skeleton restores this marker at that edge of the
 * fragment, which makes a marker the model put there a duplicate.
 */
function isRestored(source: string, run: string, edge: 'open' | 'close'): boolean {
    return isFreeEdge(source, edge) && hoistedMarkers(source, edge).has(run);
}

/** Delimiter runs of one flavour in the text, tags excluded. */
function countRuns(text: string, run: string): number {
    const runs = text.replace(TAG, '').match(ANY_RUN) || [];

    return runs.filter((found) => found === run).length;
}

/** Markers of one flavour the inline tags of the text stand for. */
function countTagMarkers(text: string, run: string): number {
    let count = 0;

    for (const [tag] of text.matchAll(HOISTED_TAG)) {
        count += Number(attr(tag, 'equiv-text') === run);
    }

    for (const [tag] of text.matchAll(CONTAINED_TAG)) {
        count += Number(attr(tag, 'x-begin') === run) + Number(attr(tag, 'x-end') === run);
    }

    return count;
}

/**
 * Tells whether the markers of one flavour still pair up. Every marker of
 * the source fragment is accounted for either by a tag the translation
 * kept or by the marker a model that lost that tag wrote in its place, so
 * an odd remainder means one marker has no partner.
 */
function isBalanced(source: string, text: string, run: string): boolean {
    const dropped = Math.max(0, countTagMarkers(source, run) - countTagMarkers(text, run));
    const expected = countRuns(source, run) + dropped;

    return Math.abs(countRuns(text, run) - expected) % 2 === 0;
}

/**
 * Tells whether the model wrapped a fragment that has no emphasis of its
 * own into a pair of markers: both are invented, and removing them leaves
 * no orphaned marker behind.
 */
function isWrapping(source: string, run: string, text: string): boolean {
    if (OPEN_RUN.test(source) || CLOSE_RUN.test(source)) {
        return false;
    }

    if (
        hoistedMarkers(source, 'open').size ||
        hoistedMarkers(source, 'close').size ||
        containedMarkers(source).size
    ) {
        return false;
    }

    const runs = text.match(ANY_RUN) || [];

    return runs.length === 2 && runs.every((found) => found === run);
}

/**
 * Removes a marker run repeating the marker a hoisted tag restores, e.g.
 * `Release date:**<x ctype="bold_close" equiv-text="**"/>`, which composes
 * into a four-marker run.
 */
function stripHoistedDuplicates(text: string): EmphasisRepair {
    let stripped = 0;

    const result = text.replace(
        HOISTED_EDGE,
        (match: string, before: string, tag: string, after: string) => {
            const equiv = attr(tag, 'equiv-text');
            const ctype = attr(tag, 'ctype') || '';

            if (!equiv) {
                return match;
            }

            let head = before || '';
            let tail = after || '';

            if (head === equiv && ctype.endsWith('_close')) {
                head = '';
                stripped++;
            }

            if (tail === equiv && ctype.endsWith('_open')) {
                tail = '';
                stripped++;
            }

            return head + tag + tail;
        },
    );

    return {text: result, stripped};
}

/**
 * Cuts a marker left without a partner at a free edge, e.g. the closing
 * one of a pair the model wrapped a fragment in while its opening one was
 * removed as a duplicate of the skeleton marker.
 */
function stripOrphans(source: string, translation: string): EmphasisRepair {
    let text = translation;
    let stripped = 0;

    for (const edge of ['close', 'open'] as const) {
        const run = (edge === 'close' ? OPEN_RUN : CLOSE_RUN).exec(text)?.[1];

        if (
            !run ||
            !isFreeEdge(source, edge) ||
            containedMarkers(source).has(run) ||
            isBalanced(source, text, run)
        ) {
            continue;
        }

        text = edge === 'close' ? text.slice(run.length) : text.slice(0, -run.length);
        stripped++;
    }

    return {text, stripped};
}

/**
 * Cuts emphasis the model grew around the fragment, comparing it with the
 * source unit. Both texts are unit bodies, without the `<source>` wrapper.
 */
export function stripAddedEmphasis(source: string, translation: string): EmphasisRepair {
    let text = translation;
    let stripped = 0;

    const leading = OPEN_RUN.exec(text)?.[1];
    const trailing = CLOSE_RUN.exec(text)?.[1];
    const restoredLeading = leading ? isRestored(source, leading, 'close') : false;
    const restoredTrailing = trailing ? isRestored(source, trailing, 'open') : false;

    if (leading && restoredLeading) {
        text = text.slice(leading.length);
        stripped++;
    }

    if (trailing && restoredTrailing) {
        text = text.slice(0, -trailing.length);
        stripped++;
    }

    if (
        !restoredLeading &&
        !restoredTrailing &&
        leading &&
        leading === trailing &&
        isWrapping(source, leading, text)
    ) {
        text = text.slice(leading.length, -leading.length);
        stripped += 2;
    }

    // A source fragment with the same marker glued to a hoisted tag is
    // broken on its own; leave such a pair alone instead of guessing.
    if (stripHoistedDuplicates(source).stripped) {
        return {text, stripped};
    }

    const duplicates = stripHoistedDuplicates(text);
    const orphans = stripOrphans(source, duplicates.text);

    return {text: orphans.text, stripped: stripped + duplicates.stripped + orphans.stripped};
}
