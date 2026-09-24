import type {JSONObject} from '@diplodoc/translation';

/**
 * A structural element of a document that carries translation units: one
 * line of a markdown skeleton (a paragraph, a list item, a table row, a
 * heading) or one string property of a yaml skeleton.
 */
export type Block = {
    /** Indexes of the units carried by the block, in document order. */
    units: number[];
    /** The line with placeholders and inline markup normalized. */
    signature: string;
    /** The signature with runs of placeholders collapsed: the block role regardless of unit count. */
    structure: string;
    /** Language-independent tokens of the block units and their surroundings. */
    anchors: string[];
    /** Signature plus anchors: equal keys mean the same element with the same content. */
    key: string;
};

/** Source block index paired with a target block index. */
export type BlockPair = [number, number];

const PLACEHOLDER = /%%%(\d+)%%%/g;
const HAS_PLACEHOLDER = /%%%\d+%%%/;
const INLINE_MARKUP = /[*_`~^]/g;
const LEADING_INDENT = /^[ \t]*/;
const BULLET = /^[*+] /;
const ORDERED = /^\d+[.)] /;
const PLACEHOLDER_RUN = /%%%(?: %%%)+/g;

const SOURCE_WRAPPER = /^\s*<source(?:\s[^>]*)?>([\s\S]*)<\/source>\s*$/;
// `[^<>]` keeps a run of unclosed `<` from being rescanned quadratically.
const TAG = /<[^<>]+>/g;
const ENTITY = /&#?\w+;/g;
const LINK_DESTINATION = /\]\(([^)\s"]+)\)/g;
const BARE_URL = /\bhttps?:\/\/[^\s<>"')]+/g;
const CODE_MARKER = /<x\s[^>]*ctype="code_(open|close)"[^>]*\/>/g;
const NUMBER = /\d+(?:\.\d+)*/g;
// A language path segment of a localized link: `/en/`, `/ru/`, `/en-us/`.
const LANGUAGE_SEGMENT = /\/[a-z]{2}(?:-[a-z]{2})?(?=\/|$)/gi;

/** Locale-independent string order: anchors and keys must compare the same on every machine. */
function byCodePoint(a: string, b: string): number {
    if (a === b) {
        return 0;
    }
    return a < b ? -1 : 1;
}

/**
 * Language-independent tokens of a unit: link destinations, inline code and
 * numbers. Two translations of one sentence carry the same tokens, two
 * different sentences rarely do, so the tokens both pin blocks during
 * alignment and reject wrong pairs.
 *
 * Links are compared with their language segments masked, see
 * `languageNeutralUrl`.
 *
 * Numbers are read from the tag-stripped text only: placeholder ids and
 * entities inside tags are transport noise. Dotted numbers stay whole
 * (versions), other separators split, so a range or a date compares the
 * same whatever dash or slash the translation uses. Inline code is read
 * between the `code_open`/`code_close` placeholders; a marker hoisted into
 * the skeleton leaves an unpaired placeholder, and the span then runs to
 * the unit edge.
 */
export function unitAnchors(unit: string): string[] {
    const text = unwrap(unit);
    const plain = text.replace(TAG, ' ').replace(ENTITY, ' ');
    const anchors: string[] = [];

    const urls = new Set<string>();
    for (const [, url] of text.matchAll(LINK_DESTINATION)) {
        urls.add(url);
    }
    for (const [url] of plain.matchAll(BARE_URL)) {
        urls.add(url);
    }
    for (const url of urls) {
        anchors.push('url:' + languageNeutralUrl(url));
    }

    for (const code of codeSpans(text)) {
        anchors.push('code:' + code);
    }

    for (const [number] of plain.matchAll(NUMBER)) {
        anchors.push('num:' + number);
    }

    return anchors.sort(byCodePoint);
}

/**
 * The link with its language segments masked. A translator points a link
 * to the page in the language of the translation (`/docs/ru/...` for
 * `/docs/en/...`), and both still stand for the same link.
 */
export function languageNeutralUrl(url: string): string {
    return url.replace(LANGUAGE_SEGMENT, '/*');
}

/** The unit text without its XLIFF `<source>` wrapper. */
export function unwrap(unit: string): string {
    return unit.replace(SOURCE_WRAPPER, '$1');
}

function codeSpans(text: string): string[] {
    const spans: string[] = [];
    let open: number | null = null;

    for (const match of text.matchAll(CODE_MARKER)) {
        const index = match.index as number;
        if (match[1] === 'open') {
            open = index + match[0].length;
        } else {
            // A close without an open: the span started before the unit.
            spans.push(text.slice(open ?? 0, index));
            open = null;
        }
    }

    if (open !== null) {
        // An open without a close: the span runs to the end of the unit.
        spans.push(text.slice(open));
    }

    return spans.map((span) => span.replace(TAG, '').trim()).filter(Boolean);
}

/**
 * Splits an extract skeleton into blocks.
 *
 * Markdown: every line carrying a placeholder is a block. Lines without
 * placeholders (blank lines, fences, `{% endcut %}`) are the structure between
 * blocks. Yaml: every string property carrying a placeholder is a block,
 * identified by its property path with array indexes dropped.
 *
 * Units that no skeleton line carries (there should be none) are appended as
 * blocks of their own, so that every unit belongs to exactly one block.
 */
export function parseBlocks(skeleton: string | JSONObject | undefined, units: string[]): Block[] {
    let blocks: Block[] = [];
    if (typeof skeleton === 'string') {
        blocks = markdownBlocks(skeleton, units);
    } else if (skeleton) {
        blocks = objectBlocks(skeleton, units);
    }

    const seen = new Set(blocks.flatMap((block) => block.units));
    for (let index = 0; index < units.length; index++) {
        if (!seen.has(index)) {
            blocks.push(makeBlock([index], '', '', [], units));
        }
    }

    return blocks;
}

function makeBlock(
    ids: number[],
    signature: string,
    structure: string,
    context: string[],
    units: string[],
): Block {
    const anchors = [...context, ...ids.flatMap((id) => unitAnchors(units[id] ?? ''))].sort(
        byCodePoint,
    );

    return {units: ids, signature, structure, anchors, key: JSON.stringify([signature, anchors])};
}

/**
 * The signature keeps what tells blocks apart structurally: indentation,
 * list markers, container syntax, link destinations. Inline markup is
 * dropped because the translation may hoist emphasis and code markers into
 * the skeleton differently, and list marker flavours are unified.
 */
function markdownBlocks(skeleton: string, units: string[]): Block[] {
    const blocks: Block[] = [];

    for (const line of skeleton.split('\n')) {
        const ids = Array.from(line.matchAll(PLACEHOLDER), (match) => Number(match[1]));
        if (!ids.length) {
            continue;
        }

        const raw = (LEADING_INDENT.exec(line) as RegExpExecArray)[0];
        const indent = raw.replace(/\t/g, '    ');
        const body = line
            .slice(raw.length)
            .replace(BULLET, '- ')
            .replace(ORDERED, '1. ')
            .replace(PLACEHOLDER, '%%%')
            .replace(INLINE_MARKUP, '')
            .replace(/\s+/g, ' ')
            .trim();
        const signature = indent + body;
        const structure = indent + body.replace(PLACEHOLDER_RUN, '%%%');

        blocks.push(makeBlock(ids, signature, structure, [], units));
    }

    return blocks;
}

/**
 * Scalar siblings of a translated property (`href`, `id`, flags) identify
 * the object it belongs to: in a toc the `href` tells entries apart, the
 * `name` is what gets translated.
 */
function objectBlocks(skeleton: JSONObject, units: string[]): Block[] {
    const blocks: Block[] = [];

    visit(skeleton, '', []);

    return blocks.sort((a, b) => a.units[0] - b.units[0]);

    function visit(node: unknown, path: string, context: string[]) {
        if (typeof node === 'string') {
            const ids = Array.from(node.matchAll(PLACEHOLDER), (match) => Number(match[1]));
            if (ids.length) {
                blocks.push(makeBlock(ids, path, path, context, units));
            }
            return;
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                visit(item, path + '[]', context);
            }
            return;
        }

        if (!node || typeof node !== 'object') {
            return;
        }

        const entries = Object.entries(node as Record<string, unknown>);
        const scalars = entries
            .filter(([, value]) => isPlainScalar(value))
            .map(([name, value]) => `ctx:${name}=${String(value)}`);

        for (const [name, value] of entries) {
            visit(value, path ? `${path}.${name}` : name, scalars);
        }
    }
}

function isPlainScalar(value: unknown): boolean {
    return (
        (typeof value === 'string' && !HAS_PLACEHOLDER.test(value)) ||
        typeof value === 'number' ||
        typeof value === 'boolean'
    );
}

// Beyond this many DP cells the quadratic table is not worth its memory;
// the alignment then relies on the common prefix and suffix plus recovery.
const LCS_CELL_LIMIT = 16_000_000;

/**
 * Longest common subsequence of two item lists as index pairs, in order.
 * The common prefix and suffix are paired outright, the middle goes through
 * the quadratic table. Ties are resolved by skipping source items first.
 */
export function lcs(source: string[], target: string[]): [number, number][] {
    const pairs: [number, number][] = [];

    let start = 0;
    while (start < source.length && start < target.length && source[start] === target[start]) {
        pairs.push([start, start]);
        start++;
    }

    let endSource = source.length;
    let endTarget = target.length;
    while (
        endSource > start &&
        endTarget > start &&
        source[endSource - 1] === target[endTarget - 1]
    ) {
        endSource--;
        endTarget--;
    }

    const n = endSource - start;
    const m = endTarget - start;
    if (n && m && n * m <= LCS_CELL_LIMIT) {
        pairs.push(
            ...middlePairs(source.slice(start, endSource), target.slice(start, endTarget), start),
        );
    }

    for (let k = 0; k < source.length - endSource; k++) {
        pairs.push([endSource + k, endTarget + k]);
    }

    return pairs;
}

/** LCS pairs of two lists without a common prefix or suffix, offset by `start`. */
function middlePairs(source: string[], target: string[], start: number): [number, number][] {
    const n = source.length;
    const m = target.length;
    const width = m + 1;
    const table = lcsTable(source, target);
    const pairs: [number, number][] = [];

    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (source[i] === target[j]) {
            pairs.push([start + i, start + j]);
            i++;
            j++;
        } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
            i++;
        } else {
            j++;
        }
    }

    return pairs;
}

/** Suffix LCS lengths: cell (i, j) holds the LCS length of source[i..] and target[j..]. */
function lcsTable(source: string[], target: string[]): Uint32Array {
    const n = source.length;
    const m = target.length;
    const width = m + 1;
    const table = new Uint32Array((n + 1) * width);

    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            table[i * width + j] =
                source[i] === target[j]
                    ? table[(i + 1) * width + j + 1] + 1
                    : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
        }
    }

    return table;
}

type Run = {length: number; offset: number};

/** Maximal groups of consecutive blocks sharing a structure: a list, a group of paragraphs. */
function runs(blocks: Block[]): Run[] {
    const result: Run[] = [];
    let begin = 0;

    for (let index = 0; index <= blocks.length; index++) {
        if (index < blocks.length && blocks[index].structure === blocks[begin].structure) {
            continue;
        }
        for (let k = begin; k < index; k++) {
            result.push({length: index - begin, offset: k - begin});
        }
        begin = index;
    }

    return result;
}

/**
 * Pairs the blocks of a source document with the blocks of its translation.
 *
 * 1. Longest common subsequence over block keys: anchored blocks pin the
 *    alignment, plain blocks are matched in order between the pins.
 * 2. A pair of plain blocks is kept only when the runs containing them have
 *    the same length and the blocks sit at the same offset. Otherwise the
 *    LCS had a free choice inside the run (an item was inserted or removed)
 *    and the pair is a guess.
 * 3. In every gap between kept pairs, unmatched blocks with equal structure
 *    sequences are paired positionally: their keys differ in unit count or
 *    anchors, which the unit pairing checks on its own.
 * 4. Anchored blocks with a key unique on both sides are paired wherever
 *    they are (a moved section), and the pairing is extended through the
 *    unmatched neighbours run by run while the structure agrees.
 *
 * Pairs are returned in source order; pairs from step 4 break monotonicity
 * with the target, which the seed dictionary does not need.
 */
export function alignBlocks(source: Block[], target: Block[]): BlockPair[] {
    const matching: Matching = {
        source,
        target,
        matchedSource: new Int32Array(source.length).fill(-1),
        matchedTarget: new Int32Array(target.length).fill(-1),
    };

    matchByKeys(matching);
    fillGaps(matching);
    recoverMoves(matching);

    const pairs: BlockPair[] = [];
    for (let i = 0; i < source.length; i++) {
        if (matching.matchedSource[i] >= 0) {
            pairs.push([i, matching.matchedSource[i]]);
        }
    }

    return pairs;
}

type Matching = {
    source: Block[];
    target: Block[];
    /** Target index per source block, -1 while unmatched. */
    matchedSource: Int32Array;
    /** Source index per target block, -1 while unmatched. */
    matchedTarget: Int32Array;
};

function pair(matching: Matching, i: number, j: number) {
    matching.matchedSource[i] = j;
    matching.matchedTarget[j] = i;
}

function isFree(matching: Matching, i: number, j: number): boolean {
    return matching.matchedSource[i] < 0 && matching.matchedTarget[j] < 0;
}

/** Steps 1 and 2: LCS over keys, plain pairs filtered by the run rule. */
function matchByKeys(matching: Matching) {
    const {source, target} = matching;
    const sourceRuns = runs(source);
    const targetRuns = runs(target);
    const keys = (blocks: Block[]) => blocks.map((block) => block.key);

    for (const [i, j] of lcs(keys(source), keys(target))) {
        if (!source[i].anchors.length && !sameRun(sourceRuns[i], targetRuns[j])) {
            continue;
        }
        pair(matching, i, j);
    }
}

function sameRun(a: Run, b: Run): boolean {
    return a.length === b.length && a.offset === b.offset;
}

/** Step 3: positional substitutions inside every gap between kept pairs. */
function fillGaps(matching: Matching) {
    let previousSource = -1;
    let previousTarget = -1;

    for (let i = 0; i < matching.source.length; i++) {
        const j = matching.matchedSource[i];
        if (j < 0) {
            continue;
        }
        fillGap(matching, [previousSource, previousTarget], [i, j]);
        previousSource = i;
        previousTarget = j;
    }
    fillGap(
        matching,
        [previousSource, previousTarget],
        [matching.source.length, matching.target.length],
    );
}

function fillGap(matching: Matching, previous: BlockPair, next: BlockPair) {
    const {source, target} = matching;
    const sources = range(previous[0] + 1, next[0]);
    const targets = range(previous[1] + 1, next[1]);

    if (!sources.length || sources.length !== targets.length) {
        return;
    }
    if (!sources.every((i, k) => source[i].structure === target[targets[k]].structure)) {
        return;
    }

    sources.forEach((i, k) => pair(matching, i, targets[k]));
}

/** Step 4: moved sections, found by unique anchored keys and extended run by run. */
function recoverMoves(matching: Matching) {
    const bySourceKey = unmatchedByKey(matching.source, matching.matchedSource);
    const byTargetKey = unmatchedByKey(matching.target, matching.matchedTarget);
    const recovered: BlockPair[] = [];

    for (const [key, sources] of bySourceKey) {
        const targets = byTargetKey.get(key);
        if (sources.length === 1 && targets?.length === 1) {
            pair(matching, sources[0], targets[0]);
            recovered.push([sources[0], targets[0]]);
        }
    }

    for (const [i, j] of recovered) {
        extend(matching, i, j, 1);
        extend(matching, i, j, -1);
    }
}

function extend(matching: Matching, from: number, to: number, direction: 1 | -1) {
    const {source, target, matchedSource, matchedTarget} = matching;
    let i = from + direction;
    let j = to + direction;

    while (i >= 0 && j >= 0 && i < source.length && j < target.length && isFree(matching, i, j)) {
        const sources = unmatchedRun(source, matchedSource, i, direction);
        const targets = unmatchedRun(target, matchedTarget, j, direction);
        if (source[i].structure !== target[j].structure || sources.length !== targets.length) {
            return;
        }
        sources.forEach((s, k) => pair(matching, s, targets[k]));
        i = sources[sources.length - 1] + direction;
        j = targets[targets.length - 1] + direction;
    }
}

function range(from: number, to: number): number[] {
    const result: number[] = [];
    for (let index = from; index < to; index++) {
        result.push(index);
    }
    return result;
}

function unmatchedByKey(blocks: Block[], matched: Int32Array): Map<string, number[]> {
    const result = new Map<string, number[]>();
    blocks.forEach((block, index) => {
        if (matched[index] < 0 && block.anchors.length) {
            const list = result.get(block.key) || [];
            list.push(index);
            result.set(block.key, list);
        }
    });
    return result;
}

/** Unmatched blocks from `start` in `direction` sharing the structure of the first one. */
function unmatchedRun(
    blocks: Block[],
    matched: Int32Array,
    start: number,
    direction: 1 | -1,
): number[] {
    const result: number[] = [];
    for (
        let index = start;
        index >= 0 && index < blocks.length && matched[index] < 0;
        index += direction
    ) {
        if (blocks[index].structure !== blocks[start].structure) {
            break;
        }
        result.push(index);
    }
    return result;
}
