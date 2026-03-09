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
    if (isExternalHref(url) || url.startsWith('/') || url.startsWith('#')) {
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

    const result = lines.map((line) => {
        const trimmed = line.trimStart();

        if (!inCodeBlock) {
            const match = trimmed.match(/^(`{3,}|~{3,})/);
            if (match) {
                inCodeBlock = true;
                fenceChar = match[1][0];
                fenceLength = match[1].length;
                return line;
            }
        } else {
            const closeMatch = trimmed.match(
                new RegExp(`^${fenceChar === '`' ? '`' : '~'}{${fenceLength},}\\s*$`),
            );
            if (closeMatch) {
                inCodeBlock = false;
                fenceChar = '';
                fenceLength = 0;
            }
            return line;
        }

        return rebaseLinksInLine(line, fromDir, toDir);
    });

    return result.join('\n');
}

const INLINE_LINK_RE = /(!?\[[^\]]*\]\()([^)\s]+)([^)]*\))/g;
const LINK_DEF_RE = /^(\s*\[[^\]]+\]:\s+)(\S+)(.*)$/;

function rebaseLinksInLine(line: string, fromDir: string, toDir: string): string {
    line = line.replace(INLINE_LINK_RE, (_match, prefix, url, suffix) => {
        const rebased = rebaseUrl(url, fromDir, toDir);
        if (rebased === null) {
            return _match;
        }
        return prefix + rebased + suffix;
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

function stripHash(link: string): string {
    const hashIndex = link.indexOf('#');
    return hashIndex >= 0 ? link.slice(0, hashIndex) : link;
}

/**
 * Recursively collects all deps at all nesting levels into a flat list.
 * Each entry has a colon-chain key that encodes the resolution path
 * (compatible with the transform's included preprocessor).
 *
 * For example, if root includes `_includes/a.md` which includes `inner.md`:
 *   - key for a: `_includes/a.md`
 *   - key for inner: `_includes/a.md:inner.md`
 */
function collectAllDeps(
    deps: HashedGraphNode[],
    parentKey: string,
    rootPath: NormalizedPath,
): Array<{key: string; content: string; depPath: NormalizedPath}> {
    const result: Array<{key: string; content: string; depPath: NormalizedPath}> = [];

    for (const dep of deps) {
        const linkWithoutHash = stripHash(dep.link);
        const key = parentKey ? `${parentKey}:${linkWithoutHash}` : linkWithoutHash;

        const content = contentWithoutFrontmatter(dep.content);

        result.push({key, content, depPath: dep.path});

        if (dep.deps.length > 0) {
            result.push(...collectAllDeps(dep.deps, key, rootPath));
        }
    }

    return result;
}

/**
 * Generates {% included %} blocks for all deps (recursively) and appends
 * them at the end of the file content. The {% include %} directives
 * are left as-is — they will be resolved by the includes plugin
 * using content from the {% included %} blocks.
 *
 * This allows a single self-contained md file to carry all its
 * include dependencies, reducing S3 requests in the viewer.
 */
export function mergeIncludes(_run: Run, deps: HashedGraphNode[]): StepFunction {
    return async function (_scheduler, entry): Promise<void> {
        const allDeps = collectAllDeps(deps, '', entry);

        if (allDeps.length === 0) {
            return;
        }

        const blocks = allDeps.map(
            ({key, content}) => `{% included (${key}) %}\n${content}\n{% endincluded %}`,
        );

        const appendix = '\n' + blocks.join('\n');

        _scheduler.add([0, 0], async (content) => content + appendix, {});
    } as StepFunction;
}
