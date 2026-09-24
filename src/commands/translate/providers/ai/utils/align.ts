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
    /** The key with links reduced to their page, see `linkPage`. */
    pageKey: string;
    /** Link destinations of the block units. */
    links: string[];
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
// A link destination, `<...>` and a title allowed: `](url &quot;title&quot;)`.
const LINK_DESTINATION = /\]\(<?([^\s)<>]+)>?(?:\s[^)]*)?\)/g;
// An autolink placeholder keeps its url in `equiv-text="&lt;url&gt;"`.
const AUTOLINK = /<x\b[^>]*\bctype="link_autolink"[^>]*>/g;
// A link reference definition extracted as text: `[ref]: url`, the url
// looking like an address (a scheme, a path, a section or a file), not a
// word (`[Optional]: the value`, `[Note]: e.g.`, `[Deadline]: 12:00`).
const REFERENCE = /^\s*\[[^\]]+\]:\s*<?([^\s<>]+)>?(?:\s|$)/;
const ADDRESS = /^(?:[a-z][a-z\d+.-]*:\/\/|\.{0,2}\/|#)/i;
const FILE_NAME = /\.[a-z][a-z\d]{0,4}$/i;
const BARE_URL = /\bhttps?:\/\/[^\s<>"')]+/g;
// A variable, `{{ domain }}` with spaces too; its name is `[\w.-]+`.
const VARIABLE = /\{\{\s*[\w.-]+\s*\}\}/g;
const WHOLE_VARIABLE = /^\{\{\s*[\w.-]+\s*\}\}$/;
const LANGUAGE_NAMES = new Set(['lang', 'language', 'locale', 'lng']);
const CODE_MARKER = /<x\s[^>]*ctype="code_(open|close)"[^>]*\/>/g;
const NUMBER = /\d+(?:\.\d+)*/g;
// Scheme and host of an absolute link, the scheme optional (`//host/...`):
// a translation may lead to another domain.
const ORIGIN = /^(?:[a-z][a-z\d+.-]*:)?\/\/([^/?#]*)/i;
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

/**
 * Link destinations of a unit: links with or without a title, autolinks,
 * reference definitions and bare urls of its text.
 */
export function unitLinks(unit: string): string[] {
    // Spaces inside a variable would end the link at `{{`.
    const text = unwrap(unit).replace(VARIABLE, (variable) => variable.replace(/\s+/g, ''));
    const plain = text.replace(TAG, ' ').replace(/&amp;/g, '&').replace(ENTITY, ' ');
    const urls = new Set<string>();

    for (const [, url] of text.matchAll(LINK_DESTINATION)) {
        urls.add(decodeAmp(url));
    }
    for (const [tag] of text.matchAll(AUTOLINK)) {
        const url = /equiv-text="&lt;([^"]*?)&gt;"/.exec(tag)?.[1];
        if (url) {
            urls.add(decodeAmp(url));
        }
    }
    const reference = REFERENCE.exec(plain)?.[1];
    if (reference && (ADDRESS.test(reference) || FILE_NAME.test(reference))) {
        urls.add(reference);
    }
    for (const [url] of plain.matchAll(BARE_URL)) {
        urls.add(url);
    }

    return [...urls];
}

function decodeAmp(url: string): string {
    return url.replace(/&amp;/g, '&');
}

/** Destinations of the `[...](url)` links written in a text, in order. */
export function linkDestinations(text: string): string[] {
    return Array.from(text.matchAll(LINK_DESTINATION), (match) => match[1]);
}

/** The text with every `[...](url)` destination passed through `replace`, titles kept. */
export function replaceLinkDestinations(text: string, replace: (url: string) => string): string {
    return text.replace(LINK_DESTINATION, (match, url: string) => match.replace(url, replace(url)));
}

/**
 * The link as the structure of a skeleton line compares it: the host as a
 * site without a language label, the path without the language segments
 * and suffixes, query and section (see `linkParts`). Equal keys mean the
 * same page. Unlike `linkRelation` the host counts as it is: a skeleton
 * link has no text of its own to confirm the pair, and `t.example/team_ru`
 * is not `social.example/team`. A destination that is a variable as a
 * whole stays as it is. Without languages it is the link as is.
 */
export function linkPath(url: string, languages: string[]): string {
    if (!languages.length) {
        return url;
    }

    const {host, segments, rest} = linkParts(url, languages);
    if (!segments.length) {
        return url;
    }

    return (host ? `//${host}/` : '') + segments.join('/') + rest;
}

/**
 * The key a link aligns blocks by. Without languages it is the link as is.
 * When aligning a translation, a translator points a link to the page for
 * the translation language: a language segment (`/docs/en/` for
 * `/docs/ru/`) or another domain. The key is the path without the domain
 * and the language segments, with its query and section. Whether two
 * links lead to the same page in all other cases (a variable for a part of
 * the path, a site that lays its pages out differently) is decided by
 * `linkRelation` when the units are paired, not by the key.
 */
export function linkAnchor(url: string, languages: string[]): string {
    if (!languages.length) {
        return url;
    }

    const {segments, rest} = linkParts(url, languages);

    return segments.join('/') + rest;
}

/**
 * The page a link leads to: the last segment of its path without the
 * language ones, with its query and section. Pages of the same name in
 * different sections share it (`compute/index.md`, `storage/index.md`), so
 * it only proposes block pairs whose links `linkRelation` then confirms.
 */
function linkPage(url: string, languages: string[]): string {
    const {segments, rest} = linkParts(url, languages);

    return (segments[segments.length - 1] ?? '') + rest;
}

/**
 * How the link of a source unit relates to a link of its translation:
 * `same` for the same page, `nested` for the same page on another site
 * that lays its pages out differently, `other` otherwise. Without
 * languages links are the same only when equal.
 *
 * Query and section have to match. The path is compared without the
 * domain and the language segments (`/docs/en/` for `/docs/ru/`). A
 * variable for a part of the path (`{{source-root}}/src/main.cpp`) stands
 * for what lies between the literal segments around it. Another domain is
 * a translation of the site only when the name of the site stays
 * (`example.com` and `example.org`, not `github.com` and `gitlab.com`).
 *
 * The source path may have a section more than the translation only on
 * another site (`example.com/api/v5/check.html` for
 * `example.org/api/check.html`): such a pair is doubtful. On the same
 * site, relative links included, a section more or less is another page
 * (`docs/admin/install.md` for `docs/install.md`), and a section the
 * translation has on top of the source is, on any site, the address the
 * source has just changed.
 */
export function linkRelation(source: string, target: string, languages: string[]): LinkRelation {
    if (source === target) {
        return 'same';
    }

    if (!languages.length) {
        return 'other';
    }

    const from = linkParts(source, languages);
    const to = linkParts(target, languages);

    if (from.rest !== to.rest || !sameSite(from.host, to.host)) {
        return 'other';
    }

    if (from.variables.length || to.variables.length) {
        return variableMatch(from, to, languageCodes(languages)) ? 'same' : 'other';
    }

    if (from.segments.join('/') === to.segments.join('/')) {
        return 'same';
    }

    if (editions(source, target, from, to)) {
        return 'edition';
    }

    const otherSite = Boolean(from.host && to.host && from.host !== to.host);

    return otherSite && isSubsequence(to.segments, from.segments) ? 'nested' : 'other';
}

/**
 * Whether two links lead to the editions of one site in the languages of
 * the pair (`en.example.org/wiki/Calendar` and `ru.example.org/wiki/Календарь`),
 * at the same place of the path: a translator links the article in the
 * other language, and its title is translated. The hosts differ by their
 * language labels only, and so do the paths but for the last segment.
 */
function editions(source: string, target: string, from: LinkParts, to: LinkParts): boolean {
    const left = linkHost(source);
    const right = linkHost(target);

    // Both hosts carry a language label, and only the labels differ.
    const labelled = left !== from.host && right !== to.host;

    return (
        Boolean(left && right && left !== right && labelled && from.host === to.host) &&
        from.segments.length > 0 &&
        from.segments.length === to.segments.length &&
        from.segments.slice(0, -1).join('/') === to.segments.slice(0, -1).join('/')
    );
}

type LinkParts = {
    /** Host as a site, see `linkHost`; empty for a relative link. */
    host: string;
    /** Path segments without the language ones, `.` and `..` resolved. */
    segments: string[];
    /** Indexes of the segments with a variable. */
    variables: number[];
    /** Query and section. */
    rest: string;
};

function languageCodes(languages: string[]): Set<string> {
    return new Set(languages.map((language) => language.slice(0, 2).toLowerCase()));
}

function linkParts(url: string, languages: string[]): LinkParts {
    const query = url.search(/[?#]/);
    const end = query < 0 ? url.length : query;
    const codes = languageCodes(languages);
    const path: string[] = [];
    for (const segment of url.slice(0, end).replace(ORIGIN, '').split('/')) {
        const previous = path[path.length - 1];
        // `..` takes away a literal segment, not a variable (`{{root}}/..`).
        if (segment === '..' && previous && previous !== '..' && !previous.includes('{{')) {
            path.pop();
        } else if (segment && segment !== '.') {
            path.push(segment);
        }
    }
    const segments = path
        .filter((segment) => {
            const language = LANGUAGE.exec(segment)?.[1];

            return !(language && codes.has(language.toLowerCase()));
        })
        .map((segment) => withoutLanguageSuffix(segment, codes));

    return {
        // A language subdomain (`en.wikipedia.org`) is a language segment
        // too, unless it is all there is before the top-level domain.
        host: (linkHost(url) || '').replace(
            /^([a-z]{2})\.(?=[^.]+\.[^.]+)/,
            (label, code: string) => (codes.has(code) ? '' : label),
        ),
        segments,
        variables: segments.flatMap((segment, index) => (segment.includes('{{') ? [index] : [])),
        rest: url.slice(end),
    };
}

// A name ending with a language: `channel_ru`, `team-en@example.com`,
// `screen-en-US.png`, or with a language variable: `graph-{{lang}}.png`.
// The code in either case and an upper case region, as `segmentPattern` has it.
const LANGUAGE_SUFFIX =
    /([a-zA-Z\d])[-_]((?:[a-z]{2}|[A-Z]{2})(?:[-_][A-Z]{2})?|\{\{[^{}]+\}\})(?=$|[@.])/g;

/**
 * A path segment without the language suffixes of its names, see
 * `LANGUAGE_SUFFIX`: the name of the page in the translation language and
 * the name written with a language variable are the same name.
 */
function withoutLanguageSuffix(segment: string, codes: Set<string>): string {
    return segment.replace(LANGUAGE_SUFFIX, (match, last: string, suffix: string) => {
        const language = suffix.startsWith('{{')
            ? isLanguageVariable(suffix)
            : codes.has(suffix.slice(0, 2).toLowerCase());

        return language ? last : match;
    });
}

/**
 * Whether two links lead to one page on two sites that lay their pages out
 * differently: one path has only sections more than the other, with the
 * same query and section. On one site that is another page.
 */
function nestedPaths(a: string, b: string, languages: string[]): boolean {
    const left = linkParts(a, languages);
    const right = linkParts(b, languages);

    return (
        left.rest === right.rest &&
        Boolean(left.host && right.host && left.host !== right.host) &&
        sameSite(left.host, right.host) &&
        (isSubsequence(left.segments, right.segments) ||
            isSubsequence(right.segments, left.segments))
    );
}

/**
 * Whether the paths match around a variable: equal, or with one variable
 * segment on one side only, the segments before it start the other path and
 * the segments after it end it. What it may stand for in between, see
 * `standsFor`.
 */
function variableMatch(from: LinkParts, to: LinkParts, codes: Set<string>): boolean {
    if (from.segments.join('/') === to.segments.join('/')) {
        return true;
    }
    if (from.variables.length + to.variables.length !== 1) {
        return false;
    }

    const [pattern, path] = from.variables.length ? [from, to] : [to, from];
    const index = pattern.variables[0];
    const before = pattern.segments.slice(0, index);
    const after = pattern.segments.slice(index + 1);
    const gap = path.segments.length - before.length - after.length;

    return (
        gap >= 0 &&
        path.segments.slice(0, index).join('/') === before.join('/') &&
        path.segments.slice(index + gap).join('/') === after.join('/') &&
        standsFor(pattern.segments[index], path.segments.slice(index, index + gap), {
            first: index === 0,
            last: !after.length,
            alone: pattern.segments.length === 1,
            codes,
        })
    );
}

/**
 * Whether a variable segment may stand for these segments of the other path.
 * A language variable stands for a language segment, dropped with the
 * others, or for none, the default language (`/docs/{{lang}}/install.md`
 * for `/docs/ru/install.md` and `/docs/install.md`). A variable in a segment
 * stands for one segment around its literal parts (`v{{version}}` for `v2`).
 * Any other one stands for at least one segment, `..` only at the start
 * (`{{root}}`). A variable in the page (`/docs/{{page}}`,
 * `/docs/{{page}}.md`) or for the whole address (`{{link-console}}`) says
 * nothing about the page, unless it is a language (`graph-{{lang}}.png`).
 */
function standsFor(
    variable: string,
    segments: string[],
    {
        first,
        last,
        alone,
        codes,
    }: {first: boolean; last: boolean; alone: boolean; codes: Set<string>},
): boolean {
    if (WHOLE_VARIABLE.test(variable)) {
        if (isLanguageVariable(variable)) {
            return !segments.length && !alone;
        }

        return !last && segments.length > 0 && (first || !segments.includes('..'));
    }

    const variables = variable.match(VARIABLE) ?? [];

    return (
        segments.length === 1 &&
        (!last || variables.every(isLanguageVariable)) &&
        segmentPattern(variable, codes).test(segments[0])
    );
}

function isLanguageVariable(variable: string): boolean {
    return variable
        .replace(/[{}\s]/g, '')
        .toLowerCase()
        .split(/[-_.]/)
        .some((word) => LANGUAGE_NAMES.has(word));
}

/**
 * A segment with variables as a pattern for the segment it stands for, a
 * language variable for a code of the languages with an upper case region
 * (`ru`, `RU`, `ru-RU`, not `en-ok`).
 */
function segmentPattern(segment: string, codes: Set<string>): RegExp {
    const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
    const language =
        '(?:' +
        [...codes].flatMap((code) => [code, code.toUpperCase()]).join('|') +
        ')(?:[-_][A-Z]{2})?';
    const literals = segment.split(VARIABLE).map(escape);
    const variables = segment.match(VARIABLE) ?? [];
    const pattern = literals.reduce(
        (result, literal, index) =>
            result + (isLanguageVariable(variables[index - 1]) ? language : '.+') + literal,
    );

    return new RegExp('^' + pattern + '$');
}

/**
 * Whether two hosts are one site or its translation: the same host, or the
 * same domain name under another top-level domain (`example.com` and
 * `example.org`, `docs.example.com` and `docs.example.org`, not
 * `console.example.com` and `example.com`). Ports and addresses (`10.0.0.1`,
 * `localhost`) have to be the same. A relative link belongs to any site.
 */
function sameSite(left: string, right: string): boolean {
    if (!left || !right || left === right) {
        return true;
    }

    const [leftName, leftPort = ''] = left.split(':');
    const [rightName, rightPort = ''] = right.split(':');
    const domain = (name: string) => /\.[a-z][a-z\d-]*$/.test(name);

    if (leftPort !== rightPort || !domain(leftName) || !domain(rightName)) {
        return false;
    }

    const withoutTop = (name: string) => name.slice(0, name.lastIndexOf('.'));

    return withoutTop(leftName) === withoutTop(rightName);
}

/**
 * The host of an absolute link with its port as a site: the scheme,
 * credentials and a leading `www.` do not make another site.
 */
function linkHost(url: string): string | undefined {
    const authority = ORIGIN.exec(url)?.[1];

    return authority
        ?.replace(/^[^@]*@/, '')
        .replace(/:(?:80|443)?$/, '')
        .replace(/^www\./i, '')
        .toLowerCase();
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
    const links = ids.flatMap((id) => unitLinks(units[id] ?? ''));
    const pages = anchors
        .filter((anchor) => !anchor.startsWith('url:'))
        .concat(links.map((url) => 'url:' + linkPage(url, languages)))
        .sort(byCodePoint);

    return {
        units: ids,
        signature,
        structure,
        anchors,
        key: JSON.stringify([signature, anchors]),
        pageKey: JSON.stringify([signature, pages]),
        links,
    };
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
 * 5. With languages, blocks left in the gaps are paired by the pages their
 *    links lead to when `linkRelation` confirms every link (a translation
 *    on a site laid out differently), and step 3 runs once more.
 *
 * Pairs are returned in source order; pairs from step 4 break monotonicity
 * with the target, which the seed dictionary does not need.
 */
export function alignBlocks(
    source: Block[],
    target: Block[],
    languages: string[] = [],
): BlockPair[] {
    const matching: Matching = {
        source,
        target,
        matchedSource: new Int32Array(source.length).fill(-1),
        matchedTarget: new Int32Array(target.length).fill(-1),
    };

    matchByKeys(matching);
    fillGaps(matching);
    recoverMoves(matching);

    if (languages.length) {
        matchByPages(matching, languages);
        fillGaps(matching);
    }

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

/**
 * Step 5: blocks of every gap left by the steps above paired by the pages
 * their links lead to, see `linkPage`. A translation points its links to
 * the pages of another site laid out differently, so the keys of such
 * blocks never match. A pair is kept only when every link of each block
 * leads to the same page as a link of the other one, see `linkRelation`.
 */
function matchByPages(matching: Matching, languages: string[]) {
    const {source, target, matchedSource, matchedTarget} = matching;
    const linked = (blocks: Block[], matched: Int32Array, from: number, to: number) =>
        range(from, to).filter((index) => matched[index] < 0 && blocks[index].links.length);
    const gaps: [BlockPair, BlockPair][] = [];
    let previous: BlockPair = [-1, -1];

    for (let i = 0; i < source.length; i++) {
        if (matchedSource[i] >= 0) {
            gaps.push([previous, [i, matchedSource[i]]]);
            previous = [i, matchedSource[i]];
        }
    }
    gaps.push([previous, [source.length, target.length]]);

    for (const [from, to] of gaps) {
        const sources = unique(linked(source, matchedSource, from[0] + 1, to[0]), source);
        const targets = unique(linked(target, matchedTarget, from[1] + 1, to[1]), target);
        const pairs = lcs(
            sources.map((index) => source[index].pageKey),
            targets.map((index) => target[index].pageKey),
        );

        for (const [k, l] of pairs) {
            const [i, j] = [sources[k], targets[l]];

            if (blocksLinked(source[i], target[j], languages)) {
                pair(matching, i, j);
            }
        }
    }
}

/**
 * The blocks whose page key no other block of the list has: two items of a
 * gap linking pages of one name are a choice, not a match.
 */
function unique(indexes: number[], blocks: Block[]): number[] {
    const counts = new Map<string, number>();

    for (const index of indexes) {
        counts.set(blocks[index].pageKey, (counts.get(blocks[index].pageKey) || 0) + 1);
    }

    return indexes.filter((index) => counts.get(blocks[index].pageKey) === 1);
}

/**
 * Whether every link of each block leads to the page of a link of the other
 * as far as block alignment is concerned: the same page, or the page on
 * another site laid out differently, see `nestedPaths`. Pages of the same
 * name in different sections of one site (`compute/index.md`,
 * `docs/index.md`) are other pages, and so are the blocks.
 */
function blocksLinked(source: Block, target: Block, languages: string[]): boolean {
    const related = (from: string, to: string) =>
        linkRelation(from, to, languages) !== 'other' || nestedPaths(from, to, languages);

    return (
        source.links.every((from) => target.links.some((to) => related(from, to))) &&
        target.links.every((to) => source.links.some((from) => related(from, to)))
    );
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
