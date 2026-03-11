import type {Run} from '../../..';
import type {HashedGraphNode, StepFunction} from '../utils';

import {dirname, join, relative} from 'node:path';
import slugify from 'slugify';

import {isExternalHref, normalizePath} from '~/core/utils';

import {contentWithoutFrontmatter} from '../../output-html/plugins/includes';

const CODE_FENCE_RE = /^(`{3,}|~{3,})/;
const LINK_URL_RE = /(\]\(\s*)([^)\s]+)/g;
const LINK_DEF_RE = /^(\s*\[[^\]]+\]:\s+)(\S+)(\s.*|)$/;
const NOTITLE_RE = /\bnotitle\b/;
const TERM_DEF_RE = /^\[\*[^[\]]+\]:/m;
const HEADING_FULL_RE = /^(#{1,6})\s+([^\n]+)$/; // NOSONAR — simplified to avoid ReDoS
const CUSTOM_ANCHOR_RE = /\{#([\w-]+)\}/;
const SLUG_REMOVE_RE = /[^\w\s$\-,;=/]+/g;

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

function rebaseLinksInLine(line: string, fromDir: string, toDir: string): string {
    line = line.replace(LINK_URL_RE, (_match, prefix, url) => {
        // NOSONAR — regex with /g is intentional
        const rebased = rebaseUrl(url, fromDir, toDir);
        if (rebased === null) {
            return _match;
        }
        return prefix + rebased;
    });

    line = line.replace(LINK_DEF_RE, (_match, prefix, url, suffix) => {
        const rebased = rebaseUrl(url, fromDir, toDir);
        if (rebased === null) {
            return _match;
        }
        return prefix + rebased + suffix;
    });

    return line;
}

export function stripHash(link: string): string {
    const hashIndex = link.indexOf('#');
    return hashIndex >= 0 ? link.slice(0, hashIndex) : link;
}

/**
 * Determines whether an include dependency can be safely inlined
 * (replaced in-place) rather than using the {% included %} fallback.
 *
 * Conditions that prevent inlining:
 * 1. The included file contains term definitions (deferred to Step 4).
 * 2. The include directive appears at or after the first term definition
 *    in the parent content.  Term definitions always go at the end of a
 *    page, so every include below them belongs to the term section and
 *    must not be expanded until Step 4.
 * 3. The include directive is NOT standalone on its line — there is
 *    non-whitespace content before or after it (e.g. inside a term
 *    definition, blockquote, table cell, or inline text).
 *    Inlining multi-line content into such contexts breaks markdown structure.
 */
export function canInlineInclude(dep: HashedGraphNode, parentContent: string): boolean {
    const depContent = contentWithoutFrontmatter(dep.content);
    if (TERM_DEF_RE.test(depContent)) {
        return false;
    }

    const firstTermDefPos = parentContent.search(TERM_DEF_RE);
    if (firstTermDefPos >= 0 && dep.location[0] >= firstTermDefPos) {
        return false;
    }

    const lineStart = parentContent.lastIndexOf('\n', dep.location[0] - 1) + 1;
    const lineEnd = parentContent.indexOf('\n', dep.location[1]);
    const actualEnd = lineEnd >= 0 ? lineEnd : parentContent.length;

    const before = parentContent.slice(lineStart, dep.location[0]);
    const after = parentContent.slice(dep.location[1], actualEnd);

    if (before.trim() !== '' || after.trim() !== '') {
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
    return lines.join('\n');
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
        : slugify(text.replace(/\{#[\w-]+\}/g, '').trim(), {lower: true, remove: SLUG_REMOVE_RE}); // NOSONAR — regex with /g is intentional
    return {level: m[1].length, anchor};
}

/**
 * Checks whether a heading terminates the current section or starts
 * the target section.  Mutates `ctx` when the target is found.
 * Returns the extracted section content when terminated, null otherwise.
 */
function processHeadingForSection(
    heading: {level: number; anchor: string},
    hash: string,
    ctx: {start: number; level: number},
    lines: string[],
    i: number,
): string | null {
    if (ctx.start >= 0 && heading.level <= ctx.level) {
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
 * next heading of same or lower level, or EOF.
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
): FallbackEntry[] {
    const result: FallbackEntry[] = [];
    const fromDir = dirname(depPath);
    const toDir = dirname(rootPath);

    for (const subDep of deps) {
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
 * Prepares content from a dependency for inlining: strips frontmatter,
 * extracts section by hash, optionally removes the first heading (notitle),
 * rebases paths, and applies indentation.
 */
export function prepareInlinedContent(
    dep: HashedGraphNode,
    entry: NormalizedPath,
    parentContent: string,
): string {
    let depContent = contentWithoutFrontmatter(dep.content);

    const hashIndex = dep.link.indexOf('#');
    if (hashIndex >= 0) {
        depContent = extractSection(depContent, dep.link.slice(hashIndex + 1));
    }

    if (NOTITLE_RE.test(dep.match)) {
        depContent = stripFirstHeading(depContent);
    }

    depContent = rebaseRelativePaths(depContent, dep.path, entry);

    const lineStart = parentContent.lastIndexOf('\n', dep.location[0] - 1) + 1;
    const indent = parentContent.slice(lineStart, dep.location[0]);
    if (indent) {
        depContent = addIndent(depContent, indent);
    }

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

/**
 * Merge includes plugin (Steps 1a + 1b + 2 + 3).
 *
 * For each include dep:
 * - Standalone includes (sole content on their line) without term definitions
 *   are inlined, with indent and hash support.
 * - Non-standalone includes (e.g. inside term definitions, inline text) and
 *   includes with term definitions use {% included %} fallback blocks at EOF.
 *
 * parentContent is the current content of the root file (needed for context checks).
 */
export function mergeIncludes(
    _run: Run,
    deps: HashedGraphNode[],
    parentContent: string,
): StepFunction {
    return async function (scheduler, entry): Promise<void> {
        if (deps.length === 0) {
            return;
        }

        const fallbackEntries: FallbackEntry[] = [];
        const seen = new Set<string>();

        type InlineContext = {dep: HashedGraphNode; inlinedContent: string};

        const inlineActor = async (
            content: string,
            {dep, inlinedContent}: InlineContext,
        ): Promise<string> => {
            return (
                content.slice(0, dep.location[0]) + inlinedContent + content.slice(dep.location[1])
            );
        };

        for (const dep of deps) {
            if (canInlineInclude(dep, parentContent)) {
                const inlinedContent = prepareInlinedContent(dep, entry, parentContent);
                scheduler.add(dep.location, inlineActor, {dep, inlinedContent});

                if (dep.deps.length > 0) {
                    fallbackEntries.push(
                        ...collectFallbackDepsForInlined(dep.deps, dep.path, entry, seen),
                    );
                }
            } else {
                addFallbackDep(dep, seen, fallbackEntries);
            }
        }

        if (fallbackEntries.length > 0) {
            const blocks = fallbackEntries.map(
                ({key, content}) => `{% included (${key}) %}\n${content}\n{% endincluded %}`,
            );
            const appendix = '\n' + blocks.join('\n');
            scheduler.add([0, 0], async (content) => content + appendix, {});
        }
    } as StepFunction;
}
