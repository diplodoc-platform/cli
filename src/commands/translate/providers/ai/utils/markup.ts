/**
 * Repairs inline markdown markup that a model adds to a fragment on its own.
 *
 * `extract` never leaves markup markers inside a translation unit. Markup
 * contained in the fragment travels as a `<g>` tag, and markup that starts
 * (or ends) outside of it leaves an `<x ctype="bold_close"/>` tag with the
 * marker itself in the skeleton:
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
 * The same hoisting happens to every symmetric inline delimiter, so a
 * fragment of `` `code span` at the start `` breaks into
 * `` ``code span` at the start `` in exactly the same way.
 *
 * The invented markers are cut back off in the three cases where the
 * source fragment proves them redundant:
 *
 * - the skeleton restores that very marker at that edge (a hoisted
 *   `<x .../>` tag), so the marker the model paired with it inside the
 *   fragment takes over as the delimiter;
 * - the fragment carries no markup at all and the model wrapped it whole;
 * - the marker sits at an edge the source fragment leaves free and has no
 *   partner left, e.g. because its opening one was cut as a duplicate.
 *
 * A marker a model wrote instead of a `<g>` tag it lost is the only markup
 * left in the fragment and has to survive.
 *
 * Asymmetric markup (links, liquid) is out of scope: its parts differ on
 * the two sides, so a lone marker cannot be recognized by pairing.
 */

/**
 * Symmetric inline delimiter run: emphasis (`*`, `**`, `***` and the `_`
 * flavour), inline code (a run of backticks), strikethrough and sup.
 */
const RUN = String.raw`\*{1,3}|_{1,3}|~~|\x60+|\^`;

/** Character of a delimiter run, to tell a whole run from a part of one. */
const MARKER = String.raw`\s*_~\x60^`;

/** Delimiter run opening markup at the very start of the text. */
const OPEN_RUN = new RegExp(String.raw`^(${RUN})(?=[^${MARKER}])`);

/** Delimiter run closing markup at the very end of the text. */
const CLOSE_RUN = new RegExp(String.raw`(?<=[^${MARKER}])(${RUN})$`);

/** Every delimiter run of the text, used to recognize a plain wrapping. */
const ANY_RUN = new RegExp(RUN, 'g');

/** Whole string is a delimiter run, used to tell markup tags from the rest. */
const ONLY_RUN = new RegExp(String.raw`^(?:${RUN})$`);

/** Any inline tag, and an inline tag right at a text edge. */
const TAG = /<[^>]+>/g;
const LEADING_TAG = /^<[^>]+>/;
const TRAILING_TAG = /<[^>]+>$/;

/** Self-closing tag of markup hoisted into the skeleton, with its marker. */
const HOISTED_TAG = /<x\b[^>]*\/>/g;

/** Opening tag of markup contained in the fragment, with its markers. */
const CONTAINED_TAG = /<g\b[^>]*>/g;

/** Marker run glued to a placeholder, on either side of it. */
const PLACEHOLDER_EDGE = new RegExp(String.raw`(${RUN})?(<x\b[^>]*\/>)(${RUN})?`, 'g');

export type MarkupRepair = {
    text: string;
    /** Number of delimiter runs removed from the translation. */
    stripped: number;
};

function attr(tag: string, name: string): string | undefined {
    return new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];
}

/**
 * Markers the skeleton restores around the fragment: `close` tags mean the
 * markup opened before the fragment, `open` tags mean it closes after it.
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

/** Markers of the fragment's own `<g>` tags. */
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
 * Tells whether the source fragment has no markup of its own at that
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

/** Every delimiter flavour the texts mention, as a tag marker or literally. */
function markerFlavours(...texts: string[]): Set<string> {
    const flavours = new Set<string>();

    for (const text of texts) {
        for (const marker of hoistedMarkers(text, 'open')) {
            flavours.add(marker);
        }
        for (const marker of hoistedMarkers(text, 'close')) {
            flavours.add(marker);
        }
        for (const marker of containedMarkers(text)) {
            flavours.add(marker);
        }
        for (const run of text.replace(TAG, '').match(ANY_RUN) || []) {
            flavours.add(run);
        }
    }

    return flavours;
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
 * Tells whether the model wrapped a fragment that has no markup of its own
 * into a pair of markers: both are invented, and removing them leaves no
 * orphaned marker behind.
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

    const runs = text.replace(TAG, '').match(ANY_RUN) || [];

    return runs.length === 2 && runs.every((found) => found === run);
}

/**
 * Removes a marker run repeating the marker a placeholder restores, on
 * either side of it: `compose` emits the marker at the placeholder, so a
 * literal one glued to it doubles the run wherever it stands.
 *
 * Inline code makes both sides real. A code span contained in a fragment
 * travels as a pair of placeholders around its text, so a model writing
 * the backticks it sees in the rendered line puts them outside the pair:
 * `` `<x ctype="code_open" equiv-text="`"/>a.b.c `` composes into
 * `` ``a.b.c` ``.
 */
function stripGluedDuplicates(text: string): MarkupRepair {
    let stripped = 0;

    const result = text.replace(
        PLACEHOLDER_EDGE,
        (match: string, before: string, tag: string, after: string) => {
            const equiv = attr(tag, 'equiv-text');

            if (!equiv) {
                return match;
            }

            let head = before || '';
            let tail = after || '';

            if (head === equiv) {
                head = '';
                stripped++;
            }

            if (tail === equiv) {
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
function stripOrphans(source: string, translation: string): MarkupRepair {
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
 * Cuts markup the model grew around the fragment, comparing it with the
 * source unit. Both texts are unit bodies, without the `<source>` wrapper.
 */
export function stripAddedMarkup(source: string, translation: string): MarkupRepair {
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
    if (stripGluedDuplicates(source).stripped) {
        return {text, stripped};
    }

    const duplicates = stripGluedDuplicates(text);
    const orphans = stripOrphans(source, duplicates.text);

    return {text: orphans.text, stripped: stripped + duplicates.stripped + orphans.stripped};
}

/**
 * Tells whether the repaired translation still carries the markup of the
 * source fragment, so `compose` can put the line back together.
 *
 * Every marker of the source has to be accounted for, either by the
 * placeholder it came in or by the literal marker a model that dropped
 * that placeholder wrote in its place - both compose into the same line.
 * A marker fewer means lost formatting or an unpaired delimiter, and an
 * odd remainder means a delimiter without its partner. Extra markers in
 * pairs are markup the model added of its own and compose cleanly, so
 * they are not worth another request.
 *
 * Asymmetric markup is not checked here for the same reason it is not
 * repaired: the parts of a link differ on the two sides, and a model that
 * writes a link in plain markdown instead of the placeholders composes
 * just fine.
 */
export function keepsMarkup(source: string, translation: string): boolean {
    for (const run of markerFlavours(source, translation)) {
        const expected = countRuns(source, run) + countTagMarkers(source, run);
        const actual = countRuns(translation, run) + countTagMarkers(translation, run);

        if (actual < expected || (actual - expected) % 2 !== 0) {
            return false;
        }
    }

    return true;
}
