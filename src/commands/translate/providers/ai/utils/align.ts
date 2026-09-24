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
    /** Index of the skeleton line carrying the block, markdown only. */
    line?: number;
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
// Spaces around a table cell separator: `|Continent |` is the same cell as `|Континент|`.
const CELL_SEPARATOR_SPACE = / ?\| ?/g;
// A heading id at the end of a line: `## %%%0%%% {#intro} { #other }`.
const ANCHOR = /^\{\s*#([^\s{}]+)\s*\}$/;

const SOURCE_WRAPPER = /^\s*<source(?:\s[^>]*)?>([\s\S]*)<\/source>\s*$/;
// `[^<>]` keeps a run of unclosed `<` from being rescanned quadratically.
const TAG = /<[^<>]+>/g;
const ENTITY = /&#?\w+;/g;
const LINK_DESTINATION = /\]\(([^)\s"]+)\)/g;
const BARE_URL = /\bhttps?:\/\/[^\s<>"')]+/g;
const CODE_MARKER = /<x\s[^>]*ctype="code_(open|close)"[^>]*\/>/g;
const NUMBER = /\d+(?:\.\d+)*/g;
// Scheme and host of an absolute link: a translation may lead to another domain.
const ORIGIN = /^[a-z][a-z\d+.-]*:\/\/[^/]*/i;
// A path segment naming a language: `en`, `ru`, `en-us`.
const LANGUAGE = /^([a-z]{2})(?:-[a-z]{2})?$/i;

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
 * Links are compared by their page when languages are given, see
 * `linkAnchor`.
 *
 * Numbers are read from the tag-stripped text only: placeholder ids and
 * entities inside tags are transport noise. Dotted numbers stay whole
 * (versions), other separators split, so a range or a date compares the
 * same whatever dash or slash the translation uses. Inline code is read
 * between the `code_open`/`code_close` placeholders; a marker hoisted into
 * the skeleton leaves an unpaired placeholder, and the span then runs to
 * the unit edge.
 */
export function unitAnchors(unit: string, languages: string[] = []): string[] {
    const text = unwrap(unit);
    const plain = text.replace(TAG, ' ').replace(ENTITY, ' ');
    const anchors: string[] = [];

    for (const url of unitLinks(unit)) {
        anchors.push('url:' + linkAnchor(url, languages));
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
 * `same`: the same page; `nested`: the same page under another section of
 * another site; `edition`: a page of the edition of the site in the other
 * language, whose title differs; `other`: another page.
 */
export type LinkRelation = 'same' | 'nested' | 'edition' | 'other';

/** Link destinations of a unit, bare urls of its text included. */
export function unitLinks(unit: string): string[] {
    const text = unwrap(unit);
    const plain = text.replace(TAG, ' ').replace(ENTITY, ' ');
    const urls = new Set<string>();

    for (const url of linkDestinations(text)) {
        urls.add(url);
    }
    for (const [url] of plain.matchAll(BARE_URL)) {
        urls.add(url);
    }

    return [...urls];
}

/** Destinations of the `[...](url)` links written in a text, in order. */
export function linkDestinations(text: string): string[] {
    return Array.from(text.matchAll(LINK_DESTINATION), (match) => match[1]);
}

/** The text with every `[...](url)` destination passed through `replace`. */
export function replaceLinkDestinations(text: string, replace: (url: string) => string): string {
    return text.replace(LINK_DESTINATION, (_, url: string) => `](${replace(url)})`);
}

/**
 * The link as the structure of a skeleton line compares it: the host
 * without a leading language label, the path without the language parts
 * (see `pathSegments`), the query and section. Equal keys mean the same
 * page. Unlike `linkRelation` the host counts: a skeleton link has no
 * text of its own to confirm the pair, and `t.example/team_ru` is not
 * `social.example/team`. Without languages it is the link as is.
 */
export function linkPath(url: string, languages: string[]): string {
    if (!languages.length) {
        return url;
    }

    const {path, rest} = splitLink(url);
    const segments = pathSegments(path, languages);
    // A destination that is a variable as a whole keeps it: `({{help-url}})`
    // and `({{faq-url}})` are different links.
    if (!segments.length) {
        return url;
    }

    const host = hostOf(url);
    const [label, ...labels] = host.split('.');
    const codes = new Set(languages.map((language) => language.slice(0, 2).toLowerCase()));
    const site = labels.length > 1 && codes.has(label) ? labels.join('.') : host;

    return (site ? `//${site}/` : '') + segments.join('/') + rest;
}

/**
 * The key a link aligns blocks by. Without languages it is the link as is.
 * When aligning a translation, a translator points a link to the page for
 * the translation language: another domain, a language segment, a
 * different section of the same site (`example.com/docs/api/v5/changes/check.html`
 * for `example.org/docs/api/changes/check.html`). The key is the page
 * with its query and section; a language segment is not a page (`/docs/en`
 * and `/docs/ru` are `docs`). Whether two links lead to the same page is
 * then decided by `linkRelation`.
 */
export function linkAnchor(url: string, languages: string[]): string {
    if (!languages.length) {
        return url;
    }

    const {path, rest} = splitLink(url);
    const segments = pathSegments(path, languages);
    const page = segments[segments.length - 1];

    return page ? page + rest : url;
}

/**
 * How two links relate: `same` for the same page, `nested` for the same
 * page when the path of one, without the domain and language segments,
 * contains the path of the other and more, `other` otherwise. Without
 * languages links are the same only when equal.
 *
 * Page, query and section have to match either way. Domains, language
 * segments and variables for a part of the path (`{{source-root}}`) are
 * what a translation of a page changes, so the paths without them are the
 * same page. An extra section of the path is the same page only on another
 * site, which may lay its pages out differently (`example.com/api/v5/check.html`
 * for `example.org/api/check.html`): such a pair is doubtful. On the same
 * site, relative links included, it is another page (`docs/admin/install.md`
 * for `docs/install.md`), for example the link the source has just changed.
 */
export function linkRelation(a: string, b: string, languages: string[]): LinkRelation {
    if (a === b) {
        return 'same';
    }

    if (!languages.length) {
        return 'other';
    }

    if (linkAnchor(a, languages) !== linkAnchor(b, languages)) {
        return editions(a, b, languages) ? 'edition' : 'other';
    }

    const left = pathSegments(splitLink(a).path, languages);
    const right = pathSegments(splitLink(b).path, languages);
    const endsWith = (path: string[], tail: string[]) =>
        path.slice(path.length - tail.length).join('/') === tail.join('/');

    if (
        left.join('/') === right.join('/') ||
        (isVariablePath(splitLink(a).path) && endsWith(right, left)) ||
        (isVariablePath(splitLink(b).path) && endsWith(left, right))
    ) {
        return 'same';
    }

    const nested = isSubsequence(left, right) || isSubsequence(right, left);

    return nested && otherSites(a, b) ? 'nested' : 'other';
}

/**
 * Whether two links lead to the editions of one site in the languages of
 * the pair (`en.example.org/wiki/Calendar` and `ru.example.org/wiki/Календарь`),
 * at the same place of the path: a translator links the article in the
 * other language, and its title is translated.
 */
function editions(a: string, b: string, languages: string[]): boolean {
    const left = hostOf(a);
    const right = hostOf(b);
    if (!left || !right || left === right) {
        return false;
    }

    const codes = new Set(languages.map((language) => language.slice(0, 2).toLowerCase()));
    const site = (host: string) => {
        const [label, ...rest] = host.split('.');
        return rest.length > 1 && codes.has(label) ? rest.join('.') : null;
    };
    if (!site(left) || site(left) !== site(right)) {
        return false;
    }

    const leftPath = pathSegments(splitLink(a).path, languages);
    const rightPath = pathSegments(splitLink(b).path, languages);

    return (
        leftPath.length > 0 &&
        leftPath.length === rightPath.length &&
        leftPath.slice(0, -1).join('/') === rightPath.slice(0, -1).join('/')
    );
}

/** The host of an absolute link, lowercased; empty for relative links. */
function hostOf(url: string): string {
    return (ORIGIN.exec(url)?.[0].replace(/^[^:]*:\/\//, '') || '').toLowerCase();
}

/** Whether both links are absolute and lead to different hosts. */
function otherSites(a: string, b: string): boolean {
    const left = ORIGIN.exec(a)?.[0].toLowerCase();
    const right = ORIGIN.exec(b)?.[0].toLowerCase();

    return Boolean(left && right && left !== right);
}

function splitLink(url: string): {path: string; rest: string} {
    const query = url.search(/[?#]/);
    const end = query < 0 ? url.length : query;

    return {path: url.slice(0, end).replace(ORIGIN, ''), rest: url.slice(end)};
}

function pathSegments(path: string, languages: string[]): string[] {
    const codes = new Set(languages.map((language) => language.slice(0, 2).toLowerCase()));
    const segments = path.split('/');
    // A variable (`{{source-root}}`) stands for the part of the path before
    // it: only what follows the last one is compared.
    const variable = segments.map((segment) => segment.includes('{{')).lastIndexOf(true);

    return segments
        .slice(variable + 1)
        .filter((segment) => {
            const language = LANGUAGE.exec(segment)?.[1];

            return segment && !(language && codes.has(language.toLowerCase()));
        })
        .map((segment) => withoutLanguageSuffix(segment, codes));
}

// A name ending with a language: `channel_ru`, `team-en@example.com`, `screen-en.png`.
const LANGUAGE_SUFFIX = /([a-z\d])[-_]([a-z]{2})(?=$|[@.])/gi;

/** A path segment without the language suffixes of its names, see `LANGUAGE_SUFFIX`. */
function withoutLanguageSuffix(segment: string, codes: Set<string>): string {
    return segment.replace(LANGUAGE_SUFFIX, (match, last: string, code: string) =>
        codes.has(code.toLowerCase()) ? last : match,
    );
}

/** Whether the path is written from a variable (`{{source-root}}/...`). */
function isVariablePath(path: string): boolean {
    return path.includes('{{');
}

function isSubsequence(short: string[], long: string[]): boolean {
    let index = 0;

    for (const segment of long) {
        if (index < short.length && short[index] === segment) {
            index++;
        }
    }

    return index === short.length;
}

/**
 * The text of a unit outside its code spans, tags and entities dropped:
 * where a code span of the other side may turn up as plain words.
 */
export function unitProse(unit: string): string {
    const text = unwrap(unit);
    let prose = '';
    let from = 0;
    let inCode = false;

    for (const match of text.matchAll(CODE_MARKER)) {
        const index = match.index as number;

        if (match[1] === 'open') {
            prose += text.slice(from, index);
            inCode = true;
        } else {
            // A close without an open: the span started before the unit.
            prose = inCode ? prose : '';
            inCode = false;
        }

        from = index + match[0].length;
    }

    if (!inCode) {
        prose += text.slice(from);
    }

    return prose.replace(TAG, ' ').replace(ENTITY, ' ');
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
export function parseBlocks(
    skeleton: string | JSONObject | undefined,
    units: string[],
    languages: string[] = [],
): Block[] {
    let blocks: Block[] = [];
    if (typeof skeleton === 'string') {
        blocks = markdownBlocks(skeleton, units, languages);
    } else if (skeleton) {
        blocks = objectBlocks(skeleton, units, languages);
    }

    const seen = new Set(blocks.flatMap((block) => block.units));
    for (let index = 0; index < units.length; index++) {
        if (!seen.has(index)) {
            blocks.push(makeBlock([index], '', '', [], units, languages));
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
    languages: string[],
): Block {
    const anchors = [
        ...context,
        ...ids.flatMap((id) => unitAnchors(units[id] ?? '', languages)),
    ].sort(byCodePoint);

    return {units: ids, signature, structure, anchors, key: JSON.stringify([signature, anchors])};
}

/**
 * The signature keeps what tells blocks apart structurally: indentation,
 * list markers, container syntax, link destinations (compared by their
 * path, see `linkPath`). Inline markup is dropped because the translation
 * may hoist emphasis and code markers into the skeleton differently, list
 * marker flavours are unified, and spaces around table cell separators are
 * dropped. Heading ids (`{#id}`) are anchors of the block rather than its
 * structure: a translator adds ids of their own, and a heading with an
 * extra id is still the same heading.
 */
function markdownBlocks(skeleton: string, units: string[], languages: string[]): Block[] {
    const blocks: Block[] = [];

    skeleton.split('\n').forEach((line, index) => {
        const ids = Array.from(line.matchAll(PLACEHOLDER), (match) => Number(match[1]));
        if (!ids.length) {
            return;
        }

        const raw = (LEADING_INDENT.exec(line) as RegExpExecArray)[0];
        const indent = raw.replace(/\t/g, '    ');
        const {body: text, anchors} = lineAnchors(line);
        const body = replaceLinkDestinations(text.slice(raw.length), (url) =>
            linkPath(url, languages),
        )
            .replace(BULLET, '- ')
            .replace(ORDERED, '1. ')
            .replace(PLACEHOLDER, '%%%')
            .replace(INLINE_MARKUP, '')
            .replace(/\s+/g, ' ')
            .replace(CELL_SEPARATOR_SPACE, '|')
            .trim();
        const signature = indent + body;
        const structure = indent + body.replace(PLACEHOLDER_RUN, '%%%');

        const own = anchors.map(({id}) => 'id:' + id);

        blocks.push({...makeBlock(ids, signature, structure, own, units, languages), line: index});
    });

    return blocks;
}

/**
 * Heading ids at the end of a skeleton line (`## %%%0%%% {#intro}`) and
 * the line without them. Only the tail counts: `{#T}` elsewhere on a line
 * is the text of an autotitled link, not an id.
 */
export function lineAnchors(line: string): {body: string; anchors: {id: string; text: string}[]} {
    const anchors: {id: string; text: string}[] = [];
    let end = line.trimEnd().length;

    // Read the ids from the end: a regexp for the tail is quadratic on long
    // runs of spaces.
    while (end > 0 && line[end - 1] === '}') {
        const start = line.lastIndexOf('{', end - 1);
        const match = start < 0 ? null : ANCHOR.exec(line.slice(start, end));
        if (!match) {
            break;
        }
        anchors.unshift({id: match[1], text: match[0]});
        end = line.slice(0, start).trimEnd().length;
    }

    return {body: anchors.length ? line.slice(0, end) : line, anchors};
}

/**
 * Scalar siblings of a translated property (`href`, `id`, flags) identify
 * the object it belongs to: in a toc the `href` tells entries apart, the
 * `name` is what gets translated.
 */
function objectBlocks(skeleton: JSONObject, units: string[], languages: string[]): Block[] {
    const blocks: Block[] = [];

    visit(skeleton, '', []);

    return blocks.sort((a, b) => a.units[0] - b.units[0]);

    function visit(node: unknown, path: string, context: string[]) {
        if (typeof node === 'string') {
            const ids = Array.from(node.matchAll(PLACEHOLDER), (match) => Number(match[1]));
            if (ids.length) {
                blocks.push(makeBlock(ids, path, path, context, units, languages));
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
    if (!sources.every((i, k) => sameElement(source[i], target[targets[k]]))) {
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
        if (
            sources.length !== targets.length ||
            !sources.every((s, k) => sameElement(source[s], target[targets[k]]))
        ) {
            return;
        }
        sources.forEach((s, k) => pair(matching, s, targets[k]));
        i = sources[sources.length - 1] + direction;
        j = targets[targets.length - 1] + direction;
    }
}

/**
 * Whether two blocks may be the same element when their keys differ: the
 * same structure, and heading ids that do not contradict. A translator
 * adds ids of their own, but two headings with ids and none in common are
 * two different headings (a glossary sorted by the letters of each
 * language).
 */
function sameElement(a: Block, b: Block): boolean {
    if (a.structure !== b.structure) {
        return false;
    }

    const ids = (block: Block) => block.anchors.filter((anchor) => anchor.startsWith('id:'));
    const left = ids(a);
    const right = ids(b);

    return !left.length || !right.length || left.some((id) => right.includes(id));
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
