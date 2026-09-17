import type Token from 'markdown-it/lib/token';

/**
 * Collects every anchor id reachable on a rendered page into `anchorIds`.
 *
 * Sources covered:
 * - any token carrying an `id` attribute — heading anchors produced by the
 *   `anchors` plugin (including `{#custom}` ids, GitHub-style ids and numbered
 *   duplicates like `heading-1`), as well as ids injected by other plugins;
 * - `anchor` tokens produced by the `{% anchor name %}` block plugin, whose id
 *   lives in `token.content`.
 *
 * The walk is recursive so ids nested in inline `children` (e.g. anchor links
 * inside a heading) and ids coming from included files are captured too.
 *
 * @param tokens - markdown-it tokens of the fully rendered page.
 * @param anchorIds - target set that accumulates the collected ids.
 */
export function collectAnchorIds(tokens: Token[], anchorIds: Set<string>) {
    for (const token of tokens) {
        const id = token.attrGet('id');
        if (id) {
            anchorIds.add(id);
        }

        if (token.type === 'anchor' && token.content) {
            anchorIds.add(token.content);
        }

        if (token.children) {
            collectAnchorIds(token.children, anchorIds);
        }
    }
}
