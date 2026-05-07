import type {Run} from '../../..';
import type {HashedGraphNode, Scheduler, StepFunction} from '../utils';

import {basename, dirname, join, relative} from 'node:path';
import slugify from 'slugify';

import {isExternalHref, normalizePath} from '~/core/utils';

import {contentWithoutFrontmatter} from '../../output-html/plugins/includes';

const CODE_FENCE_RE = /^(`{3,}|~{3,})/;
const LINK_URL_RE = /(\]\(\s*)([^)\s]+)/g;
const LINK_DEF_RE = /^(\s*\[(?!\*)[^\]]+\]:\s+)(\S+)(\s.*|)$/;
const NOTITLE_RE = /\bnotitle\b/;
// Leading whitespace allowed — term definitions are often indented inside lists
// (markdown-it termDefinitions uses tShift; merge-includes must match the same).
// Optional `> ` prefixes so term defs inside blockquotes match (e.g. `> [*k]:`).
const TERM_DEF_RE = /^(?:>\s*)*\s*\[\*[^[\]]+\]:/m;
// YFM table cell/row separators that may follow an include on the same line.
// These are structural tokens, not content — inlining is safe if the only
// non-whitespace text after the include directive is one of these separators.
const YFM_TABLE_SEP_RE = /^\|\||^\|#/;
const HEADING_FULL_RE = /^(#{1,6})\s+([^\n]+)$/; // NOSONAR — simplified to avoid ReDoS
const CUSTOM_ANCHOR_RE = /\{\s*#([\w-]+)\s*\}/;
const SLUG_REMOVE_RE = /[^\w\s$\-,;=/]+/g;
const TERM_DEF_LINE_RE = /^(?:>\s*)*\s*\[\*([^[\]]+)\]:/;
// CommonMark HTML block type 1 opening tags: <script>, <pre>, <style>, <textarea>
// These tags are NOT interrupted by blank lines and break rendering when indented
// inside a list item (markdown-it parses them as plain text, not HTML blocks).
// Types 2–6 (<div>, <!--, <?...) work correctly inside list items with any indent.
const HTML_BLOCK_TYPE1_RE = /^<(script|pre|style|textarea)(?:\s|>|$)/i;

/**
 * Computes the rebased URL for a relative link when content is moved
 * from one file location to another.
 *
 * Returns null if the URL should not be rebased (external, absolute, anchor-only).
 */
export function rebaseUrl(url: string, fromDir: string, toDir: string): string | null {
    if (
        isExternalHref(url) ||
        url.startsWith('/') ||
        url.startsWith('#') ||
        url.startsWith('*') ||
        url.startsWith('{')
    ) {
        return null;
    }

    const hashIndex = url.indexOf('#');
    const searchIndex = url.indexOf('?');
    const endIndex = Math.min(
        hashIndex >= 0 ? hashIndex : url.length,
        searchIndex >= 0 ? searchIndex : url.length,
    );

    const pathPart = url.slice(0, endIndex);
    const suffix = url.slice(endIndex);

    if (!pathPart) {
        return null;
    }

    const absPath = normalizePath(join(fromDir, pathPart));
    const newPath = normalizePath(relative(toDir, absPath));

    return newPath + suffix;
}

interface FenceState {
    active: boolean;
    char: string;
    len: number;
}

function newFenceState(): FenceState {
    return {active: false, char: '', len: 0};
}

/**
 * Tracks fenced code blocks across sequential line processing.
 * Returns true if the current line is inside a code block (should be skipped).
 */
function processCodeFence(trimmed: string, state: FenceState): boolean {
    if (state.active) {
        const ch = state.char === '`' ? '`' : '~';
        const closeRe = new RegExp(String.raw`^${ch}{${state.len},}(\s*$|\s*\|\|)`);
        if (closeRe.test(trimmed)) {
            state.active = false;
        }
        return true;
    }

    const match = CODE_FENCE_RE.exec(trimmed);
    if (match) {
        const fence = match[1];
        const info = trimmed.slice(fence.length);
        if (!fence.startsWith('`') || !info.includes('`')) {
            state.active = true;
            state.char = fence[0];
            state.len = fence.length;
            return true;
        }
    }

    return false;
}

/**
 * Rebases all relative markdown links, images, and link definitions
 * in content from one file location to another.
 *
 * Skips content inside fenced code blocks.
 */
export function rebaseRelativePaths(
    content: string,
    fromPath: NormalizedPath,
    toPath: NormalizedPath,
): string {
    const fromDir = dirname(fromPath) || '.';
    const toDir = dirname(toPath) || '.';

    if (fromDir === toDir) {
        return content;
    }

    const lines = content.split('\n');
    const fence = newFenceState();

    const result = lines.map((line) => {
        if (processCodeFence(line.trimStart(), fence)) {
            return line;
        }
        return rebaseLinksInLine(line, fromDir, toDir);
    });

    return result.join('\n');
}

const CODE_SPAN_PLACEHOLDER_RE = /\uFFFDCS(\d+)\uFFFD/g;

function rebaseLinksInLine(line: string, fromDir: string, toDir: string): string {
    const codeSpans: string[] = [];
    let processed = line.replace(/(`+).*?\1/g, (match) => {
        codeSpans.push(match);
        return `\uFFFDCS${codeSpans.length - 1}\uFFFD`;
    });

    processed = processed.replace(LINK_URL_RE, (_match, prefix, url) => {
        const rebased = rebaseUrl(url, fromDir, toDir);
        if (rebased === null) {
            return _match;
        }
        return prefix + rebased;
    });

    processed = processed.replace(LINK_DEF_RE, (_match, prefix, url, suffix) => {
        const rebased = rebaseUrl(url, fromDir, toDir);
        if (rebased === null) {
            return _match;
        }
        return prefix + rebased + suffix;
    });

    if (codeSpans.length > 0) {
        processed = processed.replace(
            CODE_SPAN_PLACEHOLDER_RE,
            (_m, idx) => codeSpans[Number(idx)],
        );
    }

    return processed;
}

export function stripHash(link: string): string {
    const hashIndex = link.indexOf('#');
    return hashIndex >= 0 ? link.slice(0, hashIndex) : link;
}

type TermBlock = {key: string; block: string};

/**
 * Extracts term definition blocks from markdown content.
 * In multiline mode, each definition runs from `[*key]:` to the next
 * `[*key]:` or EOF.  Returns clean content (without the term section)
 * and the individual term blocks.
 */
export function extractTermDefinitions(content: string): {
    cleanContent: string;
    terms: TermBlock[];
} {
    const lines = content.split('\n');
    const fence = newFenceState();

    const termStarts: Array<{line: number; key: string}> = [];
    for (let i = 0; i < lines.length; i++) {
        if (processCodeFence(lines[i].trim(), fence)) {
            continue;
        }
        const match = TERM_DEF_LINE_RE.exec(lines[i]);
        if (match) {
            termStarts.push({line: i, key: match[1]});
        }
    }

    if (termStarts.length === 0) {
        return {cleanContent: content, terms: []};
    }

    const firstTermLine = termStarts[0].line;

    let cleanEnd = firstTermLine;
    while (cleanEnd > 0 && lines[cleanEnd - 1].trim() === '') {
        cleanEnd--;
    }
    const cleanContent = lines.slice(0, cleanEnd).join('\n');

    const terms: TermBlock[] = [];
    for (let t = 0; t < termStarts.length; t++) {
        const start = termStarts[t].line;
        const end = t + 1 < termStarts.length ? termStarts[t + 1].line : lines.length;
        const blockLines = lines.slice(start, end);
        while (blockLines.length > 0 && blockLines[blockLines.length - 1].trim() === '') {
            blockLines.pop();
        }
        terms.push({key: termStarts[t].key, block: blockLines.join('\n')});
    }

    return {cleanContent, terms};
}

/**
 * Returns true if the content contains a top-level CommonMark HTML block
 * of **type 1** (`<script>`, `<style>`, `<pre>`, `<textarea>`) that starts
 * at the very beginning of a line (column 0).
 *
 * Type-1 blocks are special: they are NOT interrupted by blank lines and
 * break rendering when placed inside a list item with any non-zero indent —
 * markdown-it parses them as plain text rather than HTML blocks.
 *
 * Other HTML (type 6: `<div>`, `<a>`, etc.) works correctly inside list
 * items regardless of indent, so it does NOT trigger this check.
 */
export function hasTopLevelHtmlBlock(content: string): boolean {
    const lines = content.split('\n');
    const fence = newFenceState();

    for (const line of lines) {
        const trimmed = line.trimStart();
        // processCodeFence returns true when the line is inside (or opens) a code fence
        if (processCodeFence(trimmed, fence)) {
            continue;
        }
        if (HTML_BLOCK_TYPE1_RE.test(trimmed) && line === trimmed) {
            // line starts at column 0 (no leading whitespace)
            return true;
        }
    }

    return false;
}

/**
 * Determines whether an include dependency can be safely inlined
 * (replaced in-place) rather than using the {% included %} fallback.
 *
 * Conditions that prevent inlining:
 * 1. The include directive appears at or after the first term definition
 *    in the parent content (when `checkTermBoundary` is true).
 * 1b. The include lies inside the term section (after first `[*key]:`) and the
 *    dependency matches a risky pattern (GFM `**…|…**` table, `- **…` list
 *    opener, or “only nested include” on a separate line from `[*key]:`) —
 *    use `{% included %}` paste.
 * 2. There is non-whitespace content AFTER the include on the same line
 *    (e.g. `text {% include %} more` — truly inline usage), UNLESS that
 *    content is a YFM table cell/row separator (`||` or `|#`).  These
 *    structural tokens are moved to a new line after the inlined content.
 * 3. The include has any non-zero indent AND the dep content contains
 *    a top-level CommonMark HTML block of **type 1** (`<script>`, `<style>`,
 *    `<pre>`, `<textarea>`).  These tags are NOT interrupted by blank lines
 *    and break rendering when indented inside a list item — markdown-it
 *    parses them as plain text instead of HTML blocks.  Other HTML tags
 *    (`<div>`, `<a>`, etc.) work correctly inside list items with any indent.
 *
 * Content before the include (list markers, definition colons, blockquote
 * markers, whitespace) is allowed — the prefix stays in place and
 * continuation lines receive equivalent-width whitespace indent.
 *
 * @param checkTermBoundary - When false, skip the term-section boundary
 *   check.  Used for dep-mode processing where includes inside term
 *   definitions should still be resolved (the root handles term extraction).
 */
/**
 * Checks whether indented inlining of the dependency would break type-1
 * HTML blocks (<script>, <style>, <pre>, <textarea>).  These are NOT
 * interrupted by blank lines and break rendering when indented inside a
 * list item — markdown-it parses them as plain text.
 *
 * When the include uses a #hash anchor, only the extracted section is
 * checked (not the whole file).
 */
function indentedIncludeHasHtmlBlock(dep: HashedGraphNode, rawPrefix: string): boolean {
    const indent = /^\s*$/.test(rawPrefix) ? rawPrefix : ' '.repeat(rawPrefix.length);
    if (indent.length < 1) {
        return false;
    }

    let depContent = contentWithoutFrontmatter(dep.content);
    const hashIndex = dep.link.indexOf('#');
    if (hashIndex >= 0) {
        depContent = extractSection(depContent, dep.link.slice(hashIndex + 1));
    }

    return hasTopLevelHtmlBlock(depContent);
}

export function canInlineInclude(
    dep: HashedGraphNode,
    parentContent: string,
    checkTermBoundary = true,
): boolean {
    if (checkTermBoundary) {
        const firstTermDefPos = parentContent.search(TERM_DEF_RE);
        if (firstTermDefPos >= 0 && dep.location[0] >= firstTermDefPos) {
            return false;
        }
    }

    const lineEnd = parentContent.indexOf('\n', dep.location[1]);
    const actualEnd = lineEnd >= 0 ? lineEnd : parentContent.length;
    const after = parentContent.slice(dep.location[1], actualEnd);

    if (after.trim() !== '' && !YFM_TABLE_SEP_RE.test(after.trim())) {
        return false;
    }

    const lineStart = parentContent.lastIndexOf('\n', dep.location[0] - 1) + 1;
    const rawPrefix = parentContent.slice(lineStart, dep.location[0]);
    if (rawPrefix && indentedIncludeHasHtmlBlock(dep, rawPrefix)) {
        return false;
    }

    if (depBodyForcesIncludedFallbackWhenInsideTermSection(dep, parentContent)) {
        return false;
    }

    return true;
}

/**
 * Strips the first heading from markdown content (for `notitle` includes).
 * Also removes the trailing empty line after the heading if present.
 */
export function stripFirstHeading(content: string): string {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed === '') {
            continue;
        }
        if (parseHeading(trimmed)) {
            lines.splice(i, 1);
            if (i < lines.length && lines[i].trim() === '') {
                lines.splice(i, 1);
            }
            break;
        }
        break;
    }
    const result = lines.join('\n');
    // `#hash` + `notitle` on a section that is only a heading line would
    // otherwise yield an empty include (e.g. a single `#### {#id}` block).
    return result.trim() === '' ? content : result;
}

/**
 * Adds indentation to all lines of content except the first line (which
 * is already preceded by indent in the parent) and empty lines.
 *
 * Preserves original line endings (\r\n, \r, \n) for cross-platform support.
 */
export function addIndent(content: string, indent: string): string {
    if (!indent) {
        return content;
    }

    const parts = content.split(/(\r\n|\r|\n)/);
    let isFirstTextLine = true;
    const result: string[] = [];

    for (const part of parts) {
        if (part === '\r\n' || part === '\n' || part === '\r') {
            result.push(part);
            continue;
        }

        if (isFirstTextLine) {
            isFirstTextLine = false;
            result.push(part);
            continue;
        }

        result.push(part ? indent + part : part);
    }

    return result.join('');
}

/**
 * True when the first non-empty line opens a YFM pipe table (`#|`).
 * That opener cannot sit in a blockquote continuation (`> #|` breaks
 * YFM table parsing — YFM004 table-not-closed).
 */
function depStartsWithYfmTableOpener(depContent: string): boolean {
    for (const line of depContent.split('\n')) {
        if (line.trim()) {
            return /^\s*#\|/.test(line);
        }
    }
    return false;
}

/** Strips leading and trailing newline characters without regex backtracking. */
function stripLeadingAndTrailingNewlines(s: string): string {
    let start = 0;
    while (start < s.length && s.codePointAt(start) === 10) {
        start++;
    }
    let end = s.length;
    while (end > start && s.codePointAt(end - 1) === 10) {
        end--;
    }
    return start === 0 && end === s.length ? s : s.slice(start, end);
}

/** Parses a heading line and returns level + resolved anchor, or null. */
function parseHeading(trimmed: string): {level: number; anchor: string} | null {
    const m = HEADING_FULL_RE.exec(trimmed);
    if (!m) {
        return null;
    }
    const text = m[2];
    const custom = CUSTOM_ANCHOR_RE.exec(text);
    const anchor = custom
        ? custom[1]
        : slugify(text.replace(/\{\s*#[\w-]+\s*\}/g, '').trim(), {
              lower: true,
              remove: SLUG_REMOVE_RE,
          }); // NOSONAR — regex with /g is intentional
    return {level: m[1].length, anchor};
}

/**
 * Checks whether a heading terminates the current section or starts
 * the target section.  Mutates `ctx` when the target is found.
 * Returns the extracted section content when terminated, null otherwise.
 *
 * Section boundaries match `findBlockTokens` in `@diplodoc/transform`
 * (includes plugin): the slice ends at the next heading of the **same**
 * level only.  Deeper headings (e.g. `##` inside a `####` popup block) do
 * not terminate the section; shallower headings (`##` after `###`) also do
 * not — md2md output then matches token-level include-by-hash behavior.
 */
function processHeadingForSection(
    heading: {level: number; anchor: string},
    hash: string,
    ctx: {start: number; level: number},
    lines: string[],
    i: number,
): string | null {
    if (ctx.start >= 0 && heading.level === ctx.level) {
        return sliceLines(lines, ctx.start, i);
    }
    if (ctx.start < 0 && heading.anchor === hash) {
        ctx.start = i;
        ctx.level = heading.level;
    }
    return null;
}

function extractParagraph(lines: string[], start: number): string {
    let end = start + 1;
    while (end < lines.length && lines[end].trim() !== '') {
        end++;
    }
    return sliceLines(lines, start, end);
}

function sliceLines(lines: string[], start: number, end?: number): string {
    return lines.slice(start, end).join('\n').trimEnd();
}

/**
 * Extracts a section from markdown content by anchor.
 *
 * For heading anchors: returns content from the matched heading to the
 * next heading of the **same** level (matches transform `findBlockTokens`),
 * or EOF.
 *
 * For paragraph anchors ({#id} in non-heading text): returns just
 * the paragraph containing the anchor.
 *
 * Skips fenced code blocks so that headings inside them do not
 * prematurely terminate the section.
 */
export function extractSection(content: string, hash: string): string {
    const lines = content.split('\n');
    const ctx = {start: -1, level: 0};
    const fence = newFenceState();

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();

        if (processCodeFence(trimmed, fence)) {
            continue;
        }

        const heading = parseHeading(trimmed);
        if (heading) {
            const result = processHeadingForSection(heading, hash, ctx, lines, i);
            if (result !== null) {
                return result;
            }
            continue;
        }

        if (ctx.start < 0 && CUSTOM_ANCHOR_RE.exec(trimmed)?.[1] === hash) {
            return extractParagraph(lines, i);
        }
    }

    return ctx.start >= 0 ? sliceLines(lines, ctx.start) : content;
}

type FallbackEntry = {key: string; content: string};

/**
 * Recursively collects fallback deps from a sub-tree where the parent
 * was inlined. Keys are rebased (no colon-chain) because the parent's
 * path has been absorbed into the root.
 */
export function collectFallbackDepsForInlined(
    deps: HashedGraphNode[],
    depPath: NormalizedPath,
    rootPath: NormalizedPath,
    seen: Set<string>,
    parentProcessedContent?: string,
): FallbackEntry[] {
    const result: FallbackEntry[] = [];
    const fromDir = dirname(depPath);
    const toDir = dirname(rootPath);

    for (const subDep of deps) {
        if (parentProcessedContent && !parentProcessedContent.includes(subDep.match)) {
            continue;
        }

        const rebasedLink = rebaseUrl(stripHash(subDep.link), fromDir, toDir);
        const key = rebasedLink || stripHash(subDep.link);

        if (!seen.has(key)) {
            seen.add(key);
            result.push({key, content: contentWithoutFrontmatter(subDep.content)});
        }

        if (subDep.deps.length > 0) {
            result.push(...collectFallbackDepsForInlined(subDep.deps, subDep.path, rootPath, seen));
        }
    }

    return result;
}

/**
 * Recursively collects all deps as {% included %} fallback entries
 * with colon-chain keys (for non-inlined parent deps).
 */
export function collectFallbackDepsWithChain(
    deps: HashedGraphNode[],
    parentKey: string,
    seen: Set<string>,
): FallbackEntry[] {
    const result: FallbackEntry[] = [];

    for (const dep of deps) {
        const linkWithoutHash = stripHash(dep.link);
        const key = parentKey ? `${parentKey}:${linkWithoutHash}` : linkWithoutHash;

        if (!seen.has(key)) {
            seen.add(key);
            result.push({key, content: contentWithoutFrontmatter(dep.content)});
        }

        if (dep.deps.length > 0) {
            result.push(...collectFallbackDepsWithChain(dep.deps, key, seen));
        }
    }

    return result;
}

/**
 * True when the include sits inside a YFM shorthand table cell
 * (`||...|{% include %}` or `{% include %} ||`).
 */
function isInsideYfmShorthandTableCell(
    rawPrefix: string,
    trailingSuffix: string | undefined,
): boolean {
    if (trailingSuffix) {
        return true;
    }
    return /\|\|/.test(rawPrefix) && /\|\s*$/.test(rawPrefix);
}

/**
 * Wraps content with source map comments and applies indentation based on
 * the include's position in the parent document.
 */
function applySourceMapsAndIndent(
    depContent: string,
    depPath: string,
    rawPrefix: string,
    enableSourceMaps: boolean,
): string {
    const blockquoteYfmTableBreakout =
        Boolean(rawPrefix) && />/.test(rawPrefix) && depStartsWithYfmTableOpener(depContent);

    if (enableSourceMaps && depContent.trim()) {
        depContent =
            `<!-- source: ${depPath} -->\n` + depContent + `\n<!-- endsource: ${depPath} -->`;
    }

    if (blockquoteYfmTableBreakout && !enableSourceMaps && depContent.trim()) {
        depContent = '\n' + depContent;
    }

    if (rawPrefix) {
        const useLiteralPrefix = /[>|]/.test(rawPrefix);
        let indent: string;
        if (blockquoteYfmTableBreakout) {
            indent = '';
        } else if (useLiteralPrefix) {
            indent = rawPrefix;
        } else if (/^\s*$/.test(rawPrefix)) {
            indent = rawPrefix;
        } else {
            indent = ' '.repeat(rawPrefix.length);
        }
        depContent = addIndent(depContent, indent);
    }

    return depContent;
}

/**
 * Prepares content from a dependency for inlining: strips frontmatter,
 * extracts section by hash, optionally removes the first heading (notitle),
 * extracts term definitions (collecting them via termsCollector),
 * rebases paths, applies indentation, and adds source map comments.
 *
 * @param trailingSuffix - When the include directive is followed by a YFM
 *   table separator (`||` or `|#`) on the same line, pass that separator
 *   here.  It will be appended on a new line after the inlined content so
 *   that the table structure is preserved.
 */
export function prepareInlinedContent(
    dep: HashedGraphNode,
    entry: NormalizedPath,
    parentContent: string,
    enableSourceMaps = true,
    termsCollector?: Array<TermBlock & {sourcePath: string}>,
    trailingSuffix?: string,
): string {
    let depContent = contentWithoutFrontmatter(dep.content);

    const hashIndex = dep.link.indexOf('#');
    if (hashIndex >= 0) {
        depContent = extractSection(depContent, dep.link.slice(hashIndex + 1));
    }

    if (NOTITLE_RE.test(dep.match)) {
        depContent = stripFirstHeading(depContent);
    }

    if (termsCollector) {
        const {cleanContent, terms} = extractTermDefinitions(depContent);
        depContent = cleanContent;
        for (const term of terms) {
            const rebasedBlock = rebaseRelativePaths(term.block, dep.path, entry);
            const normalized = normalizeTermBlockForCompare(rebasedBlock);
            const duplicate = termsCollector.find(
                (t) => t.key === term.key && normalizeTermBlockForCompare(t.block) === normalized,
            );
            if (duplicate) {
                continue;
            }

            const conflict = termsCollector.find(
                (t) => t.key === term.key && normalizeTermBlockForCompare(t.block) !== normalized,
            );
            if (conflict) {
                const newKey = makeUniqueTermKey(term.key, dep.path, termsCollector);
                depContent = renameTermReferences(depContent, term.key, newKey);
                const newBlock = rebasedBlock.replace(`[*${term.key}]:`, `[*${newKey}]:`);
                termsCollector.push({key: newKey, block: newBlock, sourcePath: dep.path});
            } else {
                termsCollector.push({key: term.key, block: rebasedBlock, sourcePath: dep.path});
            }
        }
    }

    depContent = rebaseRelativePaths(depContent, dep.path, entry);

    depContent = stripLeadingAndTrailingNewlines(depContent);

    const lineStart = parentContent.lastIndexOf('\n', dep.location[0] - 1) + 1;
    const rawPrefix = parentContent.slice(lineStart, dep.location[0]);

    if (isInsideYfmShorthandTableCell(rawPrefix, trailingSuffix)) {
        return depContent;
    }

    depContent = applySourceMapsAndIndent(depContent, dep.path, rawPrefix, enableSourceMaps);

    return depContent;
}

/**
 * Adds a non-inlined dependency as a {% included %} fallback entry,
 * including its transitive deps with colon-chain keys.
 */
export function addFallbackDep(
    dep: HashedGraphNode,
    seen: Set<string>,
    entries: FallbackEntry[],
): void {
    const key = stripHash(dep.link);
    if (!seen.has(key)) {
        seen.add(key);
        entries.push({key, content: contentWithoutFrontmatter(dep.content)});
    }
    if (dep.deps.length > 0) {
        entries.push(...collectFallbackDepsWithChain(dep.deps, key, seen));
    }
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/**
 * Normalizes term definition block text for duplicate/conflict comparison
 * (trailing newline differences from different sources should not force a rename).
 */
function normalizeTermBlockForCompare(block: string): string {
    return block.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Generates a unique term key when a conflict is detected.
 * Appends the source file stem (e.g. `api` → `api__defs`).
 * Adds a counter suffix if the generated key already exists.
 */
function makeUniqueTermKey(
    baseKey: string,
    sourcePath: string,
    existing: ReadonlyArray<{key: string}>,
): string {
    const stem = basename(sourcePath, '.md').replace(/[^\w-]/g, '-');
    const usedKeys = new Set(existing.map((t) => t.key));
    let candidate = `${baseKey}__${stem}`;
    let counter = 2;
    while (usedKeys.has(candidate)) {
        candidate = `${baseKey}__${stem}-${counter++}`;
    }
    return candidate;
}

/**
 * Renames term references `[*oldKey]` → `[*newKey]` in content.
 * Only matches references (not definitions, which have `:` after `]`).
 */
function renameTermReferences(content: string, oldKey: string, newKey: string): string {
    const re = new RegExp(String.raw`\[\*${escapeRegExp(oldKey)}\](?!:)`, 'g');
    return content.replace(re, `[*${newKey}]`);
}

/**
 * Deduplicates collected term blocks by key.
 * Same key + same block text → keep one.
 * Same key + different text → keep first, log warning via run logger.
 */
function deduplicateTermBlocks(
    allTerms: Array<TermBlock & {sourcePath: string}>,
    logger?: {warn: (msg: string) => void},
): string {
    const seen = new Map<string, {block: string; sourcePath: string}>();

    for (const term of allTerms) {
        const existing = seen.get(term.key);
        if (!existing) {
            seen.set(term.key, {block: term.block, sourcePath: term.sourcePath});
        } else if (
            normalizeTermBlockForCompare(existing.block) !==
                normalizeTermBlockForCompare(term.block) &&
            logger
        ) {
            logger.warn(
                `Term conflict [*${term.key}]: different definitions in ` +
                    `${existing.sourcePath} and ${term.sourcePath} — keeping first`,
            );
        }
    }

    return Array.from(seen.values())
        .map(({block}) => block)
        .join('\n\n');
}

/**
 * Returns dependency markdown after frontmatter / `#hash` / `notitle`
 * stripping, **before** path rebasing — shared by `resolveDepContent` and
 * inline-safety heuristics.
 */
function getDepSliceAfterIncludeProcessing(dep: HashedGraphNode): string {
    let depContent = contentWithoutFrontmatter(dep.content);

    const hashIndex = dep.link.indexOf('#');
    if (hashIndex >= 0) {
        depContent = extractSection(depContent, dep.link.slice(hashIndex + 1));
    }

    if (NOTITLE_RE.test(dep.match)) {
        depContent = stripFirstHeading(depContent);
    }

    return depContent;
}

/**
 * True when the `[*key]:` label and the `{% include %}` start on the same
 * logical line (classic single-line term include — safe to flatten).
 */
function termIncludeSharesLineWithTermLabel(parentContent: string, dep: HashedGraphNode): boolean {
    const lineStart = parentContent.lastIndexOf('\n', dep.location[0] - 1) + 1;
    const beforeInclude = parentContent.slice(lineStart, dep.location[0]);
    return TERM_DEF_LINE_RE.test(beforeInclude);
}

/**
 * Dependency body is only a single `{% include … %}` directive (optional
 * surrounding blank lines / indentation).
 */
function depBodyIsOnlySingleIncludeDirective(dep: HashedGraphNode): boolean {
    const c = getDepSliceAfterIncludeProcessing(dep).trim();
    if (!c) {
        return false;
    }
    const nonEmptyLines = c.split('\n').filter((line) => line.trim());
    if (nonEmptyLines.length !== 1) {
        return false;
    }
    const line = nonEmptyLines[0].trim();
    return /^\{%\s*include\b/.test(line) && /%\}\s*$/.test(line);
}

/**
 * First substantive line is a Markdown list item whose text starts with
 * `**` (common in reusable snippets).  Inlined into a multiline term this
 * interacts badly with term/dfn tokenization — use `{% included %}` paste.
 */
function depInnerStartsWithBoldBulletList(dep: HashedGraphNode): boolean {
    const c = getDepSliceAfterIncludeProcessing(dep);
    const lines = c.split('\n');
    for (const line of lines) {
        if (line.trim() === '') {
            continue;
        }
        return /^\s*[-*+]\s+\*\*/.test(line);
    }
    return false;
}

/** GFM table with `**` header row — see `depBodyForcesIncludedFallbackWhenInsideTermSection`. */
function depInnerMatchesGfmTableWithBoldHeader(dep: HashedGraphNode): boolean {
    const c = getDepSliceAfterIncludeProcessing(dep);
    const lines = c.split('\n');
    let i = 0;
    while (i < lines.length && lines[i].trim() === '') {
        i++;
    }
    if (i >= lines.length) {
        return false;
    }
    const first = lines[i].trim();
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') {
        j++;
    }
    if (j >= lines.length) {
        return false;
    }
    const second = lines[j].trim();
    if (!first.includes('|') || !first.includes('**')) {
        return false;
    }
    // Delimiter: | --- | --- or --- | --- (GFM)
    if (!/\|/.test(second)) {
        return false;
    }
    if (!/^\|?[\s:]*-{3,}/.test(second) && !/-{3,}\s*\|/.test(second)) {
        return false;
    }
    return true;
}

/**
 * Include sits in the multiline term section (at/after first `[*key]:`) and
 * pulls content that must not be flattened into the parent term text.
 *
 * Triggers `{% included %}` paste when:
 * - GFM table with `**` header row (YFM009), or
 * - bullet list items starting with `**`, or
 * - dependency is only another `{% include %}` **and** the parent layout is
 *   multiline (term label and include not on the same line) — covers blockquote
 *   and normal paragraph contexts without duplicating `-`/`>` on every inlined
 *   line of the nested include.
 */
function depBodyForcesIncludedFallbackWhenInsideTermSection(
    dep: HashedGraphNode,
    parentContent: string,
): boolean {
    const firstTerm = parentContent.search(TERM_DEF_RE);
    if (firstTerm < 0 || dep.location[0] < firstTerm) {
        return false;
    }
    if (depInnerMatchesGfmTableWithBoldHeader(dep)) {
        return true;
    }
    if (depInnerStartsWithBoldBulletList(dep)) {
        return true;
    }
    if (
        depBodyIsOnlySingleIncludeDirective(dep) &&
        !termIncludeSharesLineWithTermLabel(parentContent, dep)
    ) {
        return true;
    }
    return false;
}

/**
 * Resolves a dependency's content for inline substitution without
 * source maps, indent, or term extraction — used when replacing
 * {% include %} directives inside the term definition section.
 */
function resolveDepContent(dep: HashedGraphNode, entry: NormalizedPath): string {
    return rebaseRelativePaths(getDepSliceAfterIncludeProcessing(dep), dep.path, entry);
}

type TermWithSource = TermBlock & {sourcePath: string};

/**
 * Resolves includes inside the term definition section and collects
 * term blocks for later deduplication.
 */
function processTermSectionDeps(
    deps: HashedGraphNode[],
    parentContent: string,
    firstTermDefPos: number,
    entry: NormalizedPath,
    scheduler: Scheduler,
    seen: Set<string>,
    fallbackEntries: FallbackEntry[],
    allTerms: TermWithSource[],
): void {
    let termSectionText = parentContent.slice(firstTermDefPos);

    const termDeps = deps.filter((d) => d.location[0] >= firstTermDefPos);
    termDeps.sort((a, b) => b.location[0] - a.location[0]);

    for (const dep of termDeps) {
        if (!canInlineInclude(dep, parentContent, false)) {
            addFallbackDep(dep, seen, fallbackEntries);
            continue;
        }

        const resolved = resolveDepContent(dep, entry);

        // If the resolved content is empty (e.g. locale-conditional file that
        // produced nothing), leave the original {% include %} directive in place
        // so that [*key]: keeps its include and md2html can resolve it at render
        // time.  This prevents a bare empty [*key]: from absorbing unrelated
        // {% included %} blocks that follow.
        if (!resolved.trim()) {
            continue;
        }

        const relStart = dep.location[0] - firstTermDefPos;
        const relEnd = dep.location[1] - firstTermDefPos;
        termSectionText =
            termSectionText.slice(0, relStart) + resolved + termSectionText.slice(relEnd);

        if (dep.deps.length > 0) {
            fallbackEntries.push(
                ...collectFallbackDepsForInlined(dep.deps, dep.path, entry, seen, dep.content),
            );
        }
    }

    const {terms: processedTerms} = extractTermDefinitions(termSectionText);
    allTerms.push(...processedTerms.map((t) => ({...t, sourcePath: entry})));

    scheduler.add(
        [firstTermDefPos, parentContent.length],
        async (content) => {
            const pos = content.search(TERM_DEF_RE);
            return pos >= 0 ? content.slice(0, pos).trimEnd() : content;
        },
        {},
    );
}

/**
 * Detects a YFM table separator (`||` or `|#`) immediately after the include
 * directive on the same line.
 */
function getTrailingSuffix(parentContent: string, depLocationEnd: number): string | undefined {
    const lineEnd = parentContent.indexOf('\n', depLocationEnd);
    const afterEnd = lineEnd >= 0 ? lineEnd : parentContent.length;
    const afterRaw = parentContent.slice(depLocationEnd, afterEnd);
    const sepMatch = YFM_TABLE_SEP_RE.exec(afterRaw.trim());
    return sepMatch ? sepMatch[0] : undefined;
}

/**
 * Builds the appendix string containing deduplicated term blocks and
 * `{% included %}` fallback blocks.
 */
function buildRootAppendix(
    allTerms: TermWithSource[],
    fallbackEntries: FallbackEntry[],
    multilineTerm: boolean,
    logger: Run['logger'],
): string {
    let appendix = '';

    if (multilineTerm && allTerms.length > 0) {
        appendix += '\n\n' + deduplicateTermBlocks(allTerms, logger);
    }

    if (fallbackEntries.length > 0) {
        const blocks = fallbackEntries.map(
            ({key, content}) => `{% included (${key}) %}\n${content}\n{% endincluded %}`,
        );
        appendix += '\n' + blocks.join('\n');
    }

    return appendix;
}

/**
 * Merge includes plugin (Steps 1–4).
 *
 * For each include dep:
 * - Standalone includes before the term section are inlined, with indent,
 *   hash, and term extraction support.
 * - When `multilineTermDefinitions` is true:
 *   - Includes inside the term section (after first [*key]:) are resolved
 *     inline when `canInlineInclude(..., false)` allows; otherwise
 *     `{% included %}` fallback (e.g. GFM `**…|…**` table headers in the dep).
 *   - Term definitions from root and inlined deps are extracted, deduplicated,
 *     and appended at the end of the file.
 * - When `multilineTermDefinitions` is false:
 *   - Includes after the first term def use {% included %} fallback
 *     (term definitions are left as-is).
 * - Non-standalone includes always use {% included %} fallback blocks.
 *
 * @param rootMode - When true (entry file), adds fallback blocks and term
 *   sections at the end.  When false (dep files), only inlines standalone
 *   includes so that nested include chains are resolved bottom-up.
 */
export function mergeIncludes(
    run: Run,
    deps: HashedGraphNode[],
    parentContent: string,
    enableSourceMaps = true,
    rootMode = true,
): StepFunction {
    return async function (scheduler, entry): Promise<void> {
        if (deps.length === 0) {
            return;
        }

        const multilineTerm = rootMode
            ? (run.config.content.multilineTermDefinitions ?? run.config.multilineTermDefinitions)
            : false;
        const fallbackEntries: FallbackEntry[] = [];
        const seen = new Set<string>();
        const allTerms: TermWithSource[] = [];
        const firstTermDefPos = parentContent.search(TERM_DEF_RE);

        type InlineContext = {dep: HashedGraphNode; inlinedContent: string};

        const inlineActor = async (
            content: string,
            {dep, inlinedContent}: InlineContext,
        ): Promise<string> => {
            return (
                content.slice(0, dep.location[0]) + inlinedContent + content.slice(dep.location[1])
            );
        };

        if (multilineTerm && firstTermDefPos >= 0) {
            processTermSectionDeps(
                deps,
                parentContent,
                firstTermDefPos,
                entry,
                scheduler,
                seen,
                fallbackEntries,
                allTerms,
            );
        }

        for (const dep of deps) {
            if (multilineTerm && firstTermDefPos >= 0 && dep.location[0] >= firstTermDefPos) {
                continue;
            }

            if (canInlineInclude(dep, parentContent, rootMode)) {
                const trailingSuffix = getTrailingSuffix(parentContent, dep.location[1]);
                const inlinedContent = prepareInlinedContent(
                    dep,
                    entry,
                    parentContent,
                    enableSourceMaps,
                    multilineTerm ? allTerms : undefined,
                    trailingSuffix,
                );
                scheduler.add(dep.location, inlineActor, {dep, inlinedContent});

                if (rootMode && dep.deps.length > 0) {
                    fallbackEntries.push(
                        ...collectFallbackDepsForInlined(
                            dep.deps,
                            dep.path,
                            entry,
                            seen,
                            dep.content,
                        ),
                    );
                }
            } else if (rootMode) {
                addFallbackDep(dep, seen, fallbackEntries);
            }
        }

        if (rootMode) {
            const appendix = buildRootAppendix(
                allTerms,
                fallbackEntries,
                multilineTerm,
                run.logger,
            );
            if (appendix) {
                scheduler.add([0, 0], async (content) => content + appendix, {});
            }
        }
    } as StepFunction;
}
