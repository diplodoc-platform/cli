import type Token from 'markdown-it/lib/token';
import type StateCore from 'markdown-it/lib/rules_core/state_core';
import type {Node as HtmlNode} from 'node-html-parser';

import MarkdownIt from 'markdown-it';
import attrs from 'markdown-it-attrs';
import {HTML_TAG_RE} from 'markdown-it/lib/common/html_re';
import {HTMLElement, parse as parseHtml} from 'node-html-parser';
import monospace from '@diplodoc/transform/lib/plugins/monospace';
import sup from '@diplodoc/transform/lib/plugins/sup';

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

type TitleEnvironment = {
    heading?: {kind: 'markdown'; token: Token} | {kind: 'html'; parts: (string | Token)[]};
};

const HTML_TITLE_CANDIDATE = /<\/?(?:h1|script|style|pre|code|textarea|template)(?=[\s/>])/i;
const IGNORED_HTML_CONTAINERS = new Set(['script', 'style', 'pre', 'code', 'textarea', 'template']);
const INVISIBLE_HTML_CONTAINERS = new Set(['script', 'style', 'template']);

/** Tracks an HTML H1 across block/inline tokens without reparsing a growing fragment. */
class HtmlHeading {
    readonly parts: (string | Token)[] = [];
    depth = 0;
    private ignoredTag = '';
    private ignoredDepth = 0;
    private comment = false;
    private readonly tags = new RegExp(HTML_TAG_RE.source.slice(1), 'y');

    get ignoring() {
        return Boolean(this.ignoredTag) || this.comment;
    }

    append(html: string, token?: Token): boolean {
        let start = this.depth > 0 ? 0 : -1;
        let position = 0;
        let complete = false;
        while (position < html.length) {
            const tag = this.nextTag(html, position);
            if (!tag) {
                break;
            }
            position = tag.end;
            const boundary = this.acceptTag(tag.markup);
            if (boundary === 'start') {
                start = tag.index;
            } else if (boundary === 'end') {
                complete = true;
                break;
            }
        }
        if (start >= 0) {
            // Raw blocks can be sliced immediately. Inline tokens are rendered
            // later, after the attribute plugin has updated their children.
            this.parts.push(token || html.slice(start, complete ? position : html.length));
        }
        return complete;
    }

    private nextTag(html: string, position: number) {
        while (position < html.length) {
            if (this.comment) {
                const end = html.indexOf('-->', position);
                if (end < 0) {
                    return undefined;
                }
                this.comment = false;
                position = end + 3;
            }
            const index = html.indexOf('<', position);
            if (index < 0) {
                return undefined;
            }
            this.tags.lastIndex = index;
            const match = this.tags.exec(html);
            if (match) {
                return {markup: match[0], index, end: this.tags.lastIndex};
            }
            if (html.startsWith('<!--', index)) {
                this.comment = true;
                return undefined;
            }
            position = index + 1;
        }
        return undefined;
    }

    private acceptTag(markup: string): 'start' | 'end' | undefined {
        const tag = /^<(\/?)([a-z][a-z0-9-]*)/i.exec(markup);
        if (!tag) {
            return undefined;
        }
        const closing = Boolean(tag[1]);
        const name = tag[2].toLowerCase();
        if (this.ignoredTag) {
            this.acceptIgnoredTag(name, closing);
            return undefined;
        }
        if (!closing && IGNORED_HTML_CONTAINERS.has(name)) {
            this.ignoredTag = name;
            this.ignoredDepth = 1;
            return undefined;
        }
        if (name !== 'h1') {
            return undefined;
        }
        if (closing) {
            return this.depth > 0 && --this.depth === 0 ? 'end' : undefined;
        }
        this.depth++;
        return this.depth === 1 ? 'start' : undefined;
    }

    private acceptIgnoredTag(name: string, closing: boolean) {
        if (name !== this.ignoredTag) {
            return;
        }
        if (closing) {
            this.ignoredDepth--;
            if (this.ignoredDepth === 0) {
                this.ignoredTag = '';
            }
        } else if (name === 'template') {
            this.ignoredDepth++;
        }
    }
}

function needsHtmlHeading(token: Token, html: HtmlHeading | undefined): boolean {
    if (token.type === 'html_block') {
        return (
            Boolean(html?.depth) ||
            Boolean(html?.ignoring) ||
            HTML_TITLE_CANDIDATE.test(token.content)
        );
    }
    return (
        token.type === 'inline' &&
        (Boolean(html?.depth) || HTML_TITLE_CANDIDATE.test(token.content))
    );
}

function getHeadingMarkup(token: Token, md: MarkdownIt, env: TitleEnvironment): string {
    if (token.type === 'html_block') {
        return token.content;
    }
    md.inline.parse(token.content, md, env, token.children || []);
    // Inspect actual HTML tokens, not escaped code examples or rendered links.
    // The selected heading is rendered only after attributes have been applied.
    return (token.children || [])
        .filter((child) => child.type === 'html_inline')
        .map((child) => child.content)
        .join('');
}

function parseMarkdownHeading(state: StateCore, index: number, html?: HtmlHeading) {
    const token = state.tokens[index];
    if (token.type !== 'heading_open' || token.tag !== 'h1' || html?.depth || html?.ignoring) {
        return undefined;
    }
    const inline = state.tokens[index + 1];
    state.md.inline.parse(inline.content, state.md, state.env, inline.children || []);
    return inline;
}

function appendHtmlHeading(state: StateCore, token: Token, html: HtmlHeading): boolean {
    const markup = getHeadingMarkup(token, state.md, state.env as TitleEnvironment);
    if (!markup && !html.depth) {
        return false;
    }
    return html.append(markup, token.type === 'inline' ? token : undefined);
}

// Keep all block tokens for references and attributes. Only heading candidates
// and continuations of an open HTML heading need inline parsing.
function parseTitle(state: StateCore) {
    const env = state.env as TitleEnvironment;
    let html: HtmlHeading | undefined;
    for (let index = 0; index < state.tokens.length; index++) {
        const token = state.tokens[index];
        const inline = parseMarkdownHeading(state, index, html);
        if (inline) {
            env.heading = {kind: 'markdown', token: inline};
            return;
        }
        if (state.md.options.html && needsHtmlHeading(token, html)) {
            html ??= new HtmlHeading();
            if (appendHtmlHeading(state, token, html)) {
                env.heading = {kind: 'html', parts: html.parts};
                return;
            }
        } else if (html?.depth) {
            html.parts.push(token);
        }
    }
    if (html?.depth) {
        env.heading = {kind: 'html', parts: html.parts};
    }
}

// Keep both configurations reusable without changing shared parser options.
const titleParsers = [true, false].map((html) => {
    const parser = new MarkdownIt({html}).use(monospace).use(sup).use(attrs, {
        leftDelimiter: '{',
        rightDelimiter: '}',
    });
    parser.core.ruler.at('inline', parseTitle);
    return parser;
});

/** Returns the visible text of the first H1 in fully assembled human Markdown. */
export function getArticleTitle(markdown: string, allowHtml = true): string {
    const titleParser = titleParsers[allowHtml ? 0 : 1];
    const env: TitleEnvironment = {};
    titleParser.parse(markdown, env);
    if (env.heading?.kind === 'markdown') {
        const tokens = env.heading.token.children || [];
        if (tokens.some((token) => token.type === 'html_inline')) {
            // Render only this heading so inline HTML has the same text rules
            // as raw HTML headings, while code and entities stay escaped.
            const html = titleParser.renderer.renderInline(tokens, titleParser.options, env);
            return getHtmlText(parseHtml(html, {parseNoneClosedTags: true}))
                .replace(/\s+/g, ' ')
                .trim();
        }
        return getInlineText(tokens).trim();
    }
    if (env.heading?.kind === 'html') {
        const html = env.heading.parts
            .map((part) => {
                if (typeof part === 'string') {
                    return part;
                }
                return part.type === 'inline'
                    ? titleParser.renderer.renderInline(
                          part.children || [],
                          titleParser.options,
                          env,
                      )
                    : titleParser.renderer.render([part], titleParser.options, env);
            })
            .join('');
        const root = parseHtml(html, {parseNoneClosedTags: true});
        const heading = findHtmlHeading(root);
        return heading ? getHtmlText(heading).replace(/\s+/g, ' ').trim() : '';
    }
    return '';
}

function findHtmlHeading(node: HtmlNode): HTMLElement | undefined {
    const pending = [node];
    while (pending.length) {
        const current = pending.pop() as HtmlNode;
        if (current instanceof HTMLElement) {
            const tag = current.rawTagName?.toLowerCase();
            if (IGNORED_HTML_CONTAINERS.has(tag)) {
                continue;
            }
            if (tag === 'h1') {
                return current;
            }
        }
        for (let index = current.childNodes.length - 1; index >= 0; index--) {
            pending.push(current.childNodes[index]);
        }
    }
    return undefined;
}

function getHtmlText(node: HtmlNode): string {
    const parts: string[] = [];
    const pending = [node];
    while (pending.length) {
        const current = pending.pop() as HtmlNode;
        const text = getHtmlNodeText(current);
        if (text !== undefined) {
            parts.push(text);
            continue;
        }
        for (let index = current.childNodes.length - 1; index >= 0; index--) {
            pending.push(current.childNodes[index]);
        }
    }
    return parts.join('');
}

function getHtmlNodeText(node: HtmlNode): string | undefined {
    if (node instanceof HTMLElement) {
        const tag = node.rawTagName?.toLowerCase();
        if (INVISIBLE_HTML_CONTAINERS.has(tag)) {
            return '';
        }
        if (tag === 'br') {
            return ' ';
        }
        if (tag === 'img') {
            return node.getAttribute('alt') || '';
        }
    }
    return node.childNodes.length === 0 ? node.textContent : undefined;
}

function getInlineText(tokens: Token[]): string {
    return tokens
        .map((token) => {
            if (token.children) {
                return getInlineText(token.children);
            }

            if (token.type === 'text' || token.type === 'code_inline') {
                return token.content;
            }

            return token.type === 'softbreak' || token.type === 'hardbreak' ? ' ' : '';
        })
        .join('');
}

/**
 * Extracts H1 from existing md output only when it is equivalent to the human
 * collection. Undefined requests the canonical collector; an empty string is
 * a successfully established absence of H1.
 */
export function getPreparedArticleTitle(
    markdown: string,
    allowHtml: boolean,
    merged: boolean,
): string | undefined {
    // Leading ATX headings without links cannot depend on includes or reference
    // definitions later in the page. Attribute-bearing headings use the full path.
    const leading =
        /^(?:[ \t]*\n| {0,3}\[\/\/\]:[ \t]+#[ \t]+\([^\n()]*\)[ \t]*\n)*( {0,3}# [^\n]*(?:\n|$))/.exec(
            markdown,
        );
    if (leading && !/[[{]/.test(leading[1])) {
        return getArticleTitle(leading[0], allowHtml);
    }
    // Filtering audience blocks after merging can change their scope. Inlined
    // SVG can introduce HTML headings absent from the canonical corpus.
    if (merged && !/visibility|<svg\b|<!-- (?:end)?source:/i.test(markdown)) {
        return getArticleTitle(markdown, allowHtml);
    }
    return undefined;
}
