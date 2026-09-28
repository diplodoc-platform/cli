/**
 * Repairs inline markdown markup that a model adds to a fragment on its own.
 *
 * `extract` never leaves markup markers inside a translation unit. Markup
 * contained in the fragment travels as tags - a `<g>` wrapper, or a pair of
 * `<x ctype="code_open"/>`/`<x ctype="code_close"/>` placeholders for inline
 * code - and markup that starts (or ends) outside of it leaves a single
 * unpaired placeholder with the marker itself in the skeleton:
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
 * A marker a model wrote instead of a tag it lost is the only markup left
 * in the fragment and has to survive. What the repair cannot save is left
 * for `keepsMarkup` to reject, so the fragment goes back to the model
 * instead of reaching `compose` broken.
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

/** Self-closing placeholder tag, standing for a marker compose restores. */
const PLACEHOLDER_TAG = /<x\b[^>]*\/>/g;

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
 * Markers the skeleton restores around the fragment, found by matching the
 * placeholders up: a `close` without an `open` before it means the markup
 * opened outside the fragment, an `open` left without a `close` means it
 * ends outside.
 *
 * Counting `close` tags alone would not do. Inline code contained in the
 * fragment travels as an `<x code_open/>`/`<x code_close/>` pair inside the
 * unit, with nothing in the skeleton, while `` `abc` text `def` `` leaves a
 * matching number of tags that are both unpaired.
 */
function hoistedMarkers(source: string, edge: 'open' | 'close'): Set<string> {
    const markers = new Set<string>();
    const depth = new Map<string, number>();

    for (const [tag] of source.matchAll(PLACEHOLDER_TAG)) {
        const ctype = attr(tag, 'ctype');
        const equiv = attr(tag, 'equiv-text');

        if (!equiv || !ONLY_RUN.test(equiv) || !ctype) {
            continue;
        }

        const open = depth.get(equiv) || 0;

        if (ctype.endsWith('_open')) {
            depth.set(equiv, open + 1);
        } else if (ctype.endsWith('_close')) {
            if (open) {
                depth.set(equiv, open - 1);
            } else if (edge === 'close') {
                markers.add(equiv);
            }
        }
    }

    if (edge === 'open') {
        for (const [equiv, open] of depth) {
            if (open > 0) {
                markers.add(equiv);
            }
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

/** Markers of one flavour the inline tags of the text stand for. */
function countTagMarkers(text: string, run: string): number {
    let count = 0;

    for (const [tag] of text.matchAll(PLACEHOLDER_TAG)) {
        count += Number(attr(tag, 'equiv-text') === run);
    }

    for (const [tag] of text.matchAll(CONTAINED_TAG)) {
        count += Number(attr(tag, 'x-begin') === run) + Number(attr(tag, 'x-end') === run);
    }

    return count;
}

/** Stands in for markup that is not a delimiter, so runs do not merge across it. */
const OPAQUE = '\0';

/**
 * The fragment as `compose` will write it: every tag replaced by the
 * marker it stands for. Delimiters only meet as delimiters there, so a
 * fragment whose italic closes right where its bold does reads as the one
 * `***` run a model writes for it.
 */
function materialize(text: string): string {
    const closers: string[] = [];
    const marker = (tag: string, name: string) => {
        const value = attr(tag, name);

        return value && ONLY_RUN.test(value) ? value : OPAQUE;
    };

    return text.replace(TAG, (tag) => {
        if (tag.startsWith('</g')) {
            return closers.pop() || OPAQUE;
        }

        if (tag.startsWith('<g')) {
            closers.push(marker(tag, 'x-end'));

            return marker(tag, 'x-begin');
        }

        return tag.startsWith('<x') ? marker(tag, 'equiv-text') : OPAQUE;
    });
}

type UnpairedMarker = {ctype: string; equiv: string};

type UnpairedMarkers = {
    /** Closing placeholders met before their opening one: the marker opened before the fragment. */
    before: UnpairedMarker[];
    /** Opening placeholders still open at the end: the marker closes after the fragment. */
    after: UnpairedMarker[];
};

/**
 * Placeholders of the fragment without a partner inside it. `extract`
 * leaves them where markup crosses the fragment edge: the marker itself
 * went to the skeleton, see `hoistedMarkers`.
 */
function unpairedMarkers(text: string): UnpairedMarkers {
    const open: UnpairedMarker[] = [];
    const before: UnpairedMarker[] = [];

    for (const [tag] of text.matchAll(PLACEHOLDER_TAG)) {
        const ctype = attr(tag, 'ctype');
        const equiv = attr(tag, 'equiv-text');

        if (!ctype || !equiv || !ONLY_RUN.test(equiv)) {
            continue;
        }

        if (ctype.endsWith('_open')) {
            open.push({ctype, equiv});
        } else if (ctype.endsWith('_close')) {
            const index = open.map((marker) => marker.equiv).lastIndexOf(equiv);

            if (index >= 0) {
                open.splice(index, 1);
            } else {
                before.push({ctype, equiv});
            }
        }
    }

    return {before, after: open};
}

/**
 * Puts back, as placeholders, the markers an existing translation lost to
 * its own skeleton, so that it composes under the skeleton of the source.
 *
 * A translation reused from a target file was extracted from that file:
 * a code span ending the fragment left its closing backtick in the
 * target skeleton, and the unit keeps a lone `code_open` placeholder.
 * Composed under the source skeleton the span would never close, unless
 * the source hoisted the same marker at the same edge, in which case its
 * skeleton restores it and the unit has to stay as it is.
 *
 * Only symmetric delimiters are restored, the ones `keepsMarkup` checks.
 * Model output never needs this: its fragments come from the source.
 */
export function restoreHoistedMarkers(source: string, translation: string): string {
    const hoisted = unpairedMarkers(translation);
    const restored = unpairedMarkers(source);
    const restoredBefore = new Set(restored.before.map((marker) => marker.equiv));
    const restoredAfter = new Set(restored.after.map((marker) => marker.equiv));
    let count = 0;
    const placeholder = (ctype: string, equiv: string) =>
        `<x ctype="${ctype}" equiv-text="${equiv}" id="x-r${++count}"/>`;

    // Closes appear innermost first, so their openers go in reverse; opens
    // appear outermost first, so their closers go in reverse as well.
    const prefix = hoisted.before
        .filter((marker) => !restoredBefore.has(marker.equiv))
        .reverse()
        .map((marker) => placeholder(marker.ctype.replace(/_close$/, '_open'), marker.equiv))
        .join('');
    const suffix = hoisted.after
        .filter((marker) => !restoredAfter.has(marker.equiv))
        .reverse()
        .map((marker) => placeholder(marker.ctype.replace(/_open$/, '_close'), marker.equiv))
        .join('');

    return prefix || suffix ? prefix + translation + suffix : translation;
}

/**
 * Underscores inside a word, which are never emphasis: `row_cache`,
 * whether the translation puts it into code or leaves it plain.
 */
const INTRAWORD_UNDERSCORE = /(?<=[\p{L}\p{N}])_+(?=[\p{L}\p{N}])/gu;

/** Delimiter runs of the materialized text, by run. */
function materializedRuns(text: string): Map<string, number> {
    const runs = new Map<string, number>();
    const markup = materialize(text).replace(INTRAWORD_UNDERSCORE, '');

    for (const run of markup.match(ANY_RUN) || []) {
        runs.set(run, (runs.get(run) || 0) + 1);
    }

    return runs;
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
 * Tells whether the model wrapped the whole fragment into a pair of
 * markers of its own: the fragment has no markers of its own at the edges
 * and the pair is all there is, so removing both leaves nothing orphaned.
 *
 * Whether the pair is really invented is decided by the caller: markers
 * the fragment cannot do without are what `keepsMarkup` guards.
 */
function isWrapping(source: string, run: string, text: string): boolean {
    if (OPEN_RUN.test(source) || CLOSE_RUN.test(source)) {
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
 * Removes strong emphasis the model invents inside a fragment which had no
 * strong emphasis of that flavour. Unlike an edge wrapping, this can sit
 * around only the label of a sentence or list item.
 */
function stripInventedStrong(source: string, translation: string): MarkupRepair {
    // Literal markers can be the model's replacement for a dropped inline
    // tag (a link, for example), so only plain source fragments are safe.
    if (/<[^>]+>/.test(source)) {
        return {text: translation, stripped: 0};
    }

    const expected = materializedRuns(source);
    let text = translation;
    let stripped = 0;
    const pairs = [
        {run: '**', marker: '*'},
        {run: '__', marker: '_'},
    ] as const;

    for (const {run, marker} of pairs) {
        if (expected.has(run)) {
            continue;
        }

        const repair = stripStrongPairs(text, marker);
        text = repair.text;
        stripped += repair.stripped;
    }

    return {text, stripped};
}

type StrongDelimiter = {
    index: number;
    canOpen: boolean;
    canClose: boolean;
};

const WHITESPACE = /\s/u;
const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/;
const UNICODE_PUNCTUATION = /\p{P}/u;

function isPunctuation(char: string | undefined): boolean {
    return char !== undefined && (ASCII_PUNCTUATION.test(char) || UNICODE_PUNCTUATION.test(char));
}

function isEscaped(text: string, index: number): boolean {
    let slashes = 0;

    for (let at = index - 1; at >= 0 && text[at] === '\\'; at--) {
        slashes++;
    }

    return slashes % 2 === 1;
}

/** End of a matching inline-code span, or the end of its unmatched opening run. */
function codeSpanEnd(text: string, start: number): number {
    let openingEnd = start;

    while (text[openingEnd] === '`') {
        openingEnd++;
    }

    const width = openingEnd - start;
    let candidate = openingEnd;

    while ((candidate = text.indexOf('`', candidate)) >= 0) {
        let closingEnd = candidate;

        while (text[closingEnd] === '`') {
            closingEnd++;
        }

        if (closingEnd - candidate === width) {
            return closingEnd;
        }

        candidate = closingEnd;
    }

    return openingEnd;
}

function opaqueEnd(text: string, index: number): number | undefined {
    if (text[index] === '<') {
        const end = text.indexOf('>', index + 1);

        return end < 0 ? undefined : end + 1;
    }

    return text[index] === '`' && !isEscaped(text, index) ? codeSpanEnd(text, index) : undefined;
}

function delimiterFlanking(text: string, index: number) {
    const before = text[index - 1];
    const after = text[index + 2];
    const beforeWhitespace = before === undefined || WHITESPACE.test(before);
    const afterWhitespace = after === undefined || WHITESPACE.test(after);
    const beforePunctuation = isPunctuation(before);
    const afterPunctuation = isPunctuation(after);

    return {
        beforePunctuation,
        afterPunctuation,
        left: !afterWhitespace && (!afterPunctuation || beforeWhitespace || beforePunctuation),
        right: !beforeWhitespace && (!beforePunctuation || afterWhitespace || afterPunctuation),
    };
}

function strongDelimiter(
    text: string,
    index: number,
    marker: '*' | '_',
): StrongDelimiter | undefined {
    if (
        text.slice(index, index + 2) !== marker.repeat(2) ||
        text[index - 1] === marker ||
        text[index + 2] === marker ||
        isEscaped(text, index)
    ) {
        return undefined;
    }

    const {left, right, beforePunctuation, afterPunctuation} = delimiterFlanking(text, index);

    return {
        index,
        canOpen: left && (marker === '*' || !right || beforePunctuation),
        canClose: right && (marker === '*' || !left || afterPunctuation),
    };
}

function strongDelimiters(text: string, marker: '*' | '_'): StrongDelimiter[] {
    const delimiters: StrongDelimiter[] = [];

    for (let index = 0; index < text.length; index++) {
        const end = opaqueEnd(text, index);

        if (end) {
            index = end - 1;
        } else {
            const delimiter = strongDelimiter(text, index, marker);

            if (delimiter) {
                delimiters.push(delimiter);
                index++;
            }
        }
    }

    return delimiters;
}

/** Removes only balanced strong delimiter runs outside code and tags. */
function stripStrongPairs(text: string, marker: '*' | '_'): MarkupRepair {
    const open: StrongDelimiter[] = [];
    const stripped = new Set<number>();

    for (const delimiter of strongDelimiters(text, marker)) {
        if (delimiter.canClose && open.length) {
            const opener = open.pop();

            if (opener) {
                stripped.add(opener.index);
                stripped.add(delimiter.index);
            }
        } else if (delimiter.canOpen) {
            open.push(delimiter);
        }
    }

    let repaired = '';

    for (let index = 0; index < text.length; index++) {
        if (stripped.has(index)) {
            index++;
        } else {
            repaired += text[index];
        }
    }

    return {
        text: repaired,
        stripped: stripped.size,
    };
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
        const unwrapped = text.slice(leading.length, -leading.length);

        // Only when the fragment keeps everything it came with: a pair the
        // model wrote in place of a tag it lost is not a wrapping, it is
        // the last copy of that markup.
        if (keepsMarkup(source, unwrapped)) {
            text = unwrapped;
            stripped += 2;
        }
    }

    // A source fragment with the same marker glued to a hoisted tag is
    // broken on its own; leave such a pair alone instead of guessing.
    if (stripGluedDuplicates(source).stripped) {
        return {text, stripped};
    }

    const invented = stripInventedStrong(source, text);
    const duplicates = stripGluedDuplicates(invented.text);
    const orphans = stripOrphans(source, duplicates.text);

    return {
        text: orphans.text,
        stripped: stripped + invented.stripped + duplicates.stripped + orphans.stripped,
    };
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
    const expected = materializedRuns(source);
    const actual = materializedRuns(translation);

    for (const [run, before] of expected) {
        // Nothing lost: every run the fragment came with is still there,
        // whether the model kept its tag or wrote the marker itself.
        if ((actual.get(run) || 0) < before) {
            return false;
        }
    }

    for (const [run, after] of actual) {
        // What the model added of its own has to pair up. A lone run is a
        // delimiter nothing closes, and the line renders broken.
        if ((after - (expected.get(run) || 0)) % 2 !== 0) {
            return false;
        }
    }

    return true;
}
