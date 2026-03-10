import type {Run} from '../../..';
import type {HashedGraphNode, StepFunction} from '../utils';

import {dirname, join, relative} from 'node:path';

import {isExternalHref, normalizePath} from '~/core/utils';

import {contentWithoutFrontmatter} from '../../output-html/plugins/includes';

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
    let inCodeBlock = false;
    let fenceChar = '';
    let fenceLength = 0;

    const openFenceRe = /^(`{3,}|~{3,})/;

    const result = lines.map((line) => {
        const trimmed = line.trimStart();

        if (inCodeBlock) {
            const fencePattern = fenceChar === '`' ? '`' : '~';
            const closeRe = new RegExp(String.raw`^${fencePattern}{${fenceLength},}(\s*$|\s*\|\|)`);
            if (closeRe.exec(trimmed)) {
                inCodeBlock = false;
                fenceChar = '';
                fenceLength = 0;
            }
            return line;
        } else {
            const match = openFenceRe.exec(trimmed);
            if (match) {
                const fence = match[1];
                const infoString = trimmed.slice(fence.length);
                if (!fence.startsWith('`') || !infoString.includes('`')) {
                    inCodeBlock = true;
                    fenceChar = fence[0];
                    fenceLength = fence.length;
                    return line;
                }
            }
        }

        return rebaseLinksInLine(line, fromDir, toDir);
    });

    return result.join('\n');
}

// Matches ](url in any markdown link — handles nested links, linked images, etc.
// Every markdown link has a ](url) part regardless of nesting depth.
const LINK_URL_RE = /(\]\(\s*)([^)\s]+)/g;
const LINK_DEF_RE = /^(\s*\[[^\]]+\]:\s+)(\S+)(\s.*|)$/;

function rebaseLinksInLine(line: string, fromDir: string, toDir: string): string {
    line = line.replace(LINK_URL_RE, (_match, prefix, url) => {
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

const NOTITLE_RE = /\bnotitle\b/;
const TERM_DEF_RE = /^\[\*\w+\]:/m;
const HEADING_RE = /^#{1,6}\s/;

/**
 * Determines whether an include dependency can be safely inlined
 * (replaced in-place) rather than using the {% included %} fallback.
 *
 * Criteria: no indent, no hash fragment, no term definitions in content.
 */
export function canInlineInclude(dep: HashedGraphNode, parentContent: string): boolean {
    const lineStart = parentContent.lastIndexOf('\n', dep.location[0] - 1) + 1;
    const indent = dep.location[0] - lineStart;
    if (indent > 0) {
        return false;
    }

    // dep.hash is the content hash (for rehashing), not the URL fragment.
    // Check the original link for a URL hash fragment.
    if (dep.link.includes('#')) {
        return false;
    }

    const depContent = contentWithoutFrontmatter(dep.content);
    if (TERM_DEF_RE.test(depContent)) {
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
        if (HEADING_RE.test(trimmed)) {
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
 * optionally removes the first heading (notitle), and rebases paths.
 */
export function prepareInlinedContent(dep: HashedGraphNode, entry: NormalizedPath): string {
    let depContent = contentWithoutFrontmatter(dep.content);
    if (NOTITLE_RE.test(dep.match)) {
        depContent = stripFirstHeading(depContent);
    }
    return rebaseRelativePaths(depContent, dep.path, entry);
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
 * Merge includes plugin (Step 1a + 1b).
 *
 * For each include dep:
 * - Simple includes (no indent, no hash, no term defs) are inlined:
 *   the {% include %} directive is replaced with rebased content.
 * - Complex includes use {% included %} fallback blocks appended at EOF.
 *
 * parentContent is the current content of the root file (needed for indent check).
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
                const inlinedContent = prepareInlinedContent(dep, entry);
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
