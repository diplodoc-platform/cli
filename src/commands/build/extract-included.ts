import {dirname, join} from 'node:path';

import {normalizePath} from '~/core/utils';

const INCLUDE_REGEXP = /^\s*{%\s*included\s*\((.+?)\)\s*%}\s*$/;
const INCLUDE_END_REGEXP = /^\s*{% endincluded %}\s*$/;

/**
 * Resolves a colon-chain key (e.g., "_includes/outer.md:inner.md")
 * to a normalized path relative to the parent file.
 *
 * Each segment is resolved relative to the previous one:
 *   - First segment resolves relative to parentPath
 *   - Subsequent segments resolve relative to the previous result
 *
 * This mirrors how the transform's `included` preprocessor
 * resolves colon-chain keys via `getFullIncludePath`.
 */
function resolveColonChainKey(key: string, parentPath: NormalizedPath): NormalizedPath {
    const parts = key.split(':');
    let current = parentPath;

    for (const part of parts) {
        current = normalizePath(join(dirname(current), part));
    }

    return current;
}

/**
 * Extracts {% included (key) %}...{% endincluded %} blocks from markdown content.
 *
 * Returns:
 * - `content`: the markdown with all {% included %} blocks removed
 * - `files`: a dict mapping normalized include paths to their embedded content
 *
 * The keys are colon-chain paths (e.g., "_includes/a.md:inner.md")
 * that get resolved relative to `parentPath` to produce normalized paths
 * matching what the CLI's includes plugin computes.
 */
export function extractIncludedBlocks(
    content: string,
    parentPath: NormalizedPath,
): {content: string; files: Record<NormalizedPath, string>} {
    const files: Record<NormalizedPath, string> = {};
    const lines = content.split('\n');
    const cleanLines: string[] = [];

    let i = 0;
    while (i < lines.length) {
        const match = INCLUDE_REGEXP.exec(lines[i]);
        if (match) {
            const key = match[1];
            const blockLines: string[] = [];
            i++;
            while (i < lines.length && !INCLUDE_END_REGEXP.exec(lines[i])) {
                blockLines.push(lines[i]);
                i++;
            }
            i++;

            const resolvedPath = resolveColonChainKey(key, parentPath);
            files[resolvedPath] = blockLines.join('\n');
        } else {
            cleanLines.push(lines[i]);
            i++;
        }
    }

    return {content: cleanLines.join('\n'), files};
}
