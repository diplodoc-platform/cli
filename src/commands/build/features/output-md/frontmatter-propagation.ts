import type {Run} from '~/commands/build';
import type {EntryGraph, EntryGraphNode} from '~/core/markdown';
import type {Meta} from '~/core/meta';

import {copyJson} from '~/core/utils';

type GraphLike = Pick<EntryGraph, 'content' | 'deps'>;

/**
 * True when the frontmatter object carries at least one authored field.
 *
 * Authored frontmatter is read from `run.markdown.meta(path)` (the
 * `mangleFrontMatter` bucket), so system fields injected later into
 * `MetaService` (`vcsPath`, `generator`, …) are NOT present here — an empty
 * object means the file had no `---` block of its own.
 */
export function isMeaningfulFrontmatter(frontmatter: Meta | undefined | null): boolean {
    return Boolean(frontmatter) && Object.keys(frontmatter as Meta).length > 0;
}

/**
 * Returns the single include dependency of a node when the node's body is
 * nothing but that include directive (only whitespace — spaces, tabs,
 * newlines — is allowed before and after it).  Returns null when the node
 * has zero or multiple includes, or any non-whitespace content around the
 * single include.
 *
 * Whitespace is detected via `trim()` rather than an exact string match, so
 * a stub file such as `\n\n  {% include ... %}\n\n` still counts as
 * "nothing but the include".
 */
export function getSoleIncludeDep(graph: GraphLike): EntryGraphNode | null {
    if (graph.deps.length !== 1) {
        return null;
    }

    const [dep] = graph.deps;
    const before = graph.content.slice(0, dep.location[0]);
    const after = graph.content.slice(dep.location[1]);

    if (before.trim() !== '' || after.trim() !== '') {
        return null;
    }

    return dep;
}

/**
 * Lightweight Stage-6 (ADR-006) frontmatter merging for the special case
 * where the parent file has no frontmatter of its own and its body is
 * nothing but a single `{% include %}` directive.
 *
 * In that case the included file's authored frontmatter would otherwise be
 * dropped (merge-includes strips it via `contentWithoutFrontmatter`), leaving
 * the merged parent without a `title` and other metadata.  This resolves the
 * frontmatter to propagate into the parent:
 *
 * - returns `null` when the parent already has its own (non-empty) frontmatter
 *   — we never override authored parent metadata;
 * - returns `null` when the parent body is not exactly one include;
 * - otherwise descends the chain of "empty-except-single-include, no
 *   frontmatter" nodes and returns the authored frontmatter of the first node
 *   that has one.  A node that carries real content but no frontmatter stops
 *   the descent and yields `null` (nothing to propagate).
 *
 * The returned object is a deep copy, safe to pass to `run.meta.add` without
 * mutating the markdown service bucket.
 */
export async function resolvePropagatedFrontmatter(
    run: Run,
    entryPath: NormalizedPath,
): Promise<Meta | null> {
    const entryFrontmatter = await run.markdown.meta(entryPath);
    if (isMeaningfulFrontmatter(entryFrontmatter)) {
        return null;
    }

    const entryGraph = await run.markdown.graph(entryPath);

    const visited = new Set<string>([entryPath]);
    let node = getSoleIncludeDep(entryGraph);

    while (node) {
        if (visited.has(node.path)) {
            return null;
        }
        visited.add(node.path);

        const frontmatter = await run.markdown.meta(node.path);
        if (isMeaningfulFrontmatter(frontmatter)) {
            return copyJson(frontmatter as Meta) ?? null;
        }

        node = getSoleIncludeDep(node);
    }

    return null;
}
