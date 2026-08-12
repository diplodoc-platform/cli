import {isFenceClose, matchFenceOpen} from '~/core/utils';

/**
 * Replaces every fenced code block with a placeholder produced by `protect`.
 *
 * An unterminated fence is malformed markup rather than a code block: its
 * lines are returned as content, so the rest of the document is still
 * filtered (ADR-009 known limitation).
 */
function protectFencedBlocks(content: string, protect: (block: string) => string): string {
    const lines = content.split('\n');
    const out: string[] = [];
    let block: string[] = [];
    let markup = '';

    for (const line of lines) {
        // Leading whitespace is ignored on both ends: CommonMark allows up
        // to three spaces, and fences inside list items are indented deeper.
        const trimmed = line.trimStart();

        if (markup) {
            block.push(line);

            if (isFenceClose(trimmed, markup)) {
                out.push(protect(block.join('\n')));
                block = [];
                markup = '';
            }

            continue;
        }

        const fence = matchFenceOpen(trimmed);

        if (fence) {
            markup = fence.markup;
            block = [line];
        } else {
            out.push(line);
        }
    }

    out.push(...block);

    return out.join('\n');
}

/**
 * Removes HTML tags (with content) from markdown text.
 *
 * Used by `llms-full.txt` to strip `<style>` and `<script>` blocks that are
 * useless for LLM consumption — LLMs don't execute JS or apply CSS, so these
 * tags only add noise to the corpus.
 *
 * Handles:
 * - Tags with attributes: `<script type="text/javascript">...</script>`
 * - Multiline blocks: `<style>\n  .x { color: red; }\n</style>`
 * - Multiple tags of the same or different types in one document
 * - Tags inline with text: `Some text <style>.x{}</style> more text`
 * - Tags with indentation (inside lists, blockquotes, etc.)
 *
 * Code blocks (fence ```...``` / ~~~...~~~) are **protected** — tags inside
 * them are preserved as-is. This is important because documentation often
 * shows `<style>`/`<script>` as examples inside code blocks.
 *
 * Code block detection is a single pass over the lines, without a second
 * markdown-it parse. This is intentionally lightweight — it does not handle
 * all edge cases (YFM shorthand tables, deflist markers, blockquote-wrapped
 * fences — see ADR-006 for details). These edge cases are accepted as
 * known limitations to keep the implementation simple and fast; a false
 * negative (tag inside an undetected code block gets stripped) only affects
 * the LLM corpus quality, not the build itself. See ADR-009 for the
 * rationale.
 *
 * Tags without a matching closing tag are left untouched (the regex requires
 * both opening and closing tags to match).
 *
 * @param content - The markdown content to filter.
 * @param tags - HTML tag names to remove (e.g. `['style', 'script']`).
 * @returns The content with specified HTML tags (and their content) removed.
 */
export function stripHtmlTags(content: string, tags: string[]): string {
    if (!content || tags.length === 0) {
        return content;
    }

    // Protect fenced code blocks (``` and ~~~) from stripping — tags inside
    // code blocks (shown as examples) must be preserved.
    const placeholders: string[] = [];
    // Use a Private Use Area character as sentinel — safe, not a control char.
    const SENTINEL = '\uE000';

    const protect = (match: string): string => {
        const index = placeholders.length;
        placeholders.push(match);
        return `${SENTINEL}${index}${SENTINEL}`;
    };

    let result = protectFencedBlocks(content, protect);

    // Strip HTML tags from non-code content. Process each tag separately
    // — this is faster than a combined alternation for large documents
    // because the regex engine doesn't need to backtrack across tag names.
    for (const tag of tags) {
        const tagRegex = new RegExp(String.raw`<${tag}\b[^>]*>[^]*?<\/${tag}>`, 'gi');
        result = result.replace(tagRegex, '');
    }

    // Restore code blocks.
    const sentinelEscaped = SENTINEL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const restoreRegex = new RegExp(String.raw`${sentinelEscaped}(\d+)${sentinelEscaped}`, 'g');
    result = result.replace(restoreRegex, (_, i) => placeholders[Number(i)]);

    return result.trim();
}
