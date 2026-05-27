import type {IncludeInfo, Location} from '../types';
import type {LoaderContext} from '../loader';

import {dirname, join} from 'node:path';

import {normalizePath, parseLocalUrl, rebasePath} from '~/core/utils';

import {INCLUDE_REGEX, filterRanges, findIncludedBlockRanges, findLink} from '../utils';

/**
 * Finds ranges of fenced code blocks (``` and ~~~) so that include
 * directives inside them are treated as code examples, not real includes.
 *
 * Indented (4-space) "code blocks" intentionally are NOT detected here —
 * many docs use 4-space indentation for include continuations inside
 * lists / definition lists / tabs / cuts.
 *
 * The detector is deliberately conservative: a fence range is added only
 * when a matching closer is found.  An opener without a closer (real or
 * spurious — e.g. a backtick run on a deflist-marker line that we did
 * not recognize as the opener pair) is dropped, NOT extended to EOF.
 * Extending to EOF would silently swallow every real `{% include %}`
 * after the suspicious fence and is the lesser evil only if the fence
 * truly is unclosed — which in real docs almost always means malformed
 * markup, not "the rest of the file is a code block".
 */
function findFencedCodeBlockRanges(content: string, excludeRanges: Location[] = []): Location[] {
    const ranges: Location[] = [];
    const lines = content.split('\n');

    const lineStarts: number[] = new Array(lines.length);
    let pos = 0;
    for (let i = 0; i < lines.length; i++) {
        lineStarts[i] = pos;
        pos += lines[i].length + 1;
    }

    // Lines whose start position is contained in any excluded range
    // (e.g. an HTML comment) must NOT be considered fence boundaries:
    // the markdown parser never sees them as code blocks (the
    // surrounding HTML block consumes them as text), so pairing a
    // fence opener inside such a range with a real fence later in the
    // document would produce a phantom code range that swallows real
    // `{% include %}` directives.  See Bug 26.
    const lineIsExcluded = (line: number): boolean => {
        const lineStart = lineStarts[line];
        const lineEnd = lineStart + lines[line].length;
        return excludeRanges.some(([start, end]) => lineStart >= start && lineEnd <= end);
    };

    let openLine = -1;
    let openChar = '';
    let openLen = 0;

    // Strip a leading list-item or definition-list marker from a *trimmed*
    // line so we can recognise a fence opener that lives on the same line
    // as a list bullet (`- ```js`) or a definition-list body
    // (`:   ```js`).  Markdown-it parses such lines as a list item /
    // deflist body *containing* a code fence opener; if we don't strip
    // the prefix we'll miss the opener and pair the real closer ` ``` `
    // with whatever fence we see next, swallowing every `{% include %}`
    // in between.  See Bug 29.
    //
    // CommonMark / markdown-it indent rules for these containers mean
    // the matching closer is rendered as ` ``` ` at the continuation
    // indent (i.e. WITHOUT the bullet / `:` marker).  Our closer scan
    // therefore correctly finds it without any prefix stripping — the
    // stripping here is asymmetric on purpose.
    //
    // Blockquote (`> `) is intentionally NOT stripped: a blockquote-
    // wrapped fenced code block carries `> ` on BOTH the opener and the
    // closer line.  Symmetric stripping would also misinterpret stray
    // `> ``` ` text inside a real code block, while one-sided stripping
    // (opener only) leaves a phantom open fence that swallows every
    // subsequent `{% include %}` until the next top-level ``` shows up.
    // The cost of ignoring blockquote fences is one rare edge case
    // (`{% include %}` shown as code inside a blockquoted fence),
    // which has not been observed in any real doc set.  See Bug 30.
    const stripContainerPrefix = (s: string): string => {
        const list = /^(?:[-*+]|\d{1,9}[.)])\s+/.exec(s);
        if (list) {
            return s.slice(list[0].length);
        }
        const deflist = /^:\s+/.exec(s);
        if (deflist) {
            return s.slice(deflist[0].length);
        }
        return s;
    };

    // End-of-line closer: matches ` … ```|| `, ` … ```|# `, or ` … ```| `.
    // YFM authors frequently glue a shorthand-table cell separator onto
    // the SAME line as the fence closer with no leading newline
    // (`code platform: 'x' ```|| `).  CommonMark would not accept this as
    // a closer (closers must be at line start with only whitespace before
    // them), but markdown-it inside a YFM table cell does end the code
    // block on that line, and our scanner would otherwise pair the
    // long-open opener with whatever ` ``` ` comes next.  See Bug 28.
    const END_CLOSE_RE = /(`{3,}|~{3,})\s*(?:\|\||\|#|\|)\s*$/;

    for (let i = 0; i < lines.length; i++) {
        if (lineIsExcluded(i)) {
            continue;
        }
        const trimmed = lines[i].trimStart();

        if (openLine < 0) {
            // Looking for an opener — allow a single container prefix.
            const search = stripContainerPrefix(trimmed);
            const fenceMatch = /^(`{3,}|~{3,})/.exec(search);
            if (!fenceMatch) {
                continue;
            }
            // Indent is intentionally not limited to ≤ 3 spaces (CommonMark).
            // Fences inside lists / definition lists / cuts can use deeper
            // indent (e.g. `1.` + 4 spaces).  For "is this an include shown
            // as code?" we treat any ``` / ~~~ run as a fence.
            const fence = fenceMatch[1];
            // Backtick fence info string must not contain backticks.
            const info = search.slice(fence.length);
            if (fence[0] === '`' && info.includes('`')) {
                continue;
            }
            openLine = i;
            openChar = fence[0];
            openLen = fence.length;
            continue;
        }

        // Looking for the closer.  Closer must NOT have a container prefix
        // stripped: a `- ``` ` line while we're already inside a fence is
        // just text content (CommonMark code blocks consume `-` literally),
        // not a fresh closer.
        const startMatch = /^(`{3,}|~{3,})/.exec(trimmed);
        if (startMatch && startMatch[1][0] === openChar && startMatch[1].length >= openLen) {
            // Closing fence: same char, length ≥ open.  CommonMark forbids
            // any non-whitespace content after the closing run, but in YFM
            // real-world docs frequently glue a shorthand-table cell
            // separator (`|`, `||`, `|#`) onto the same line as the closer
            // (e.g. ` ``` |`).  Treat those as valid closers — otherwise
            // the next ` ``` ` we see would be paired with this opener and
            // we'd swallow every `{% include %}` between them.  See Bug 25.
            const after = trimmed.slice(startMatch[1].length).trim();
            if (after === '' || /^(?:\|\||\|#|\|)$/.test(after)) {
                // End at the LAST char of the close-fence line content
                // (excluding the trailing newline).  `filterRanges` below
                // treats touching ranges (`exclude[1] === point[0]`) as
                // overlapping, so an exclusive end on the newline position
                // would swallow an `{% include %}` that starts on the very
                // next line.
                ranges.push([lineStarts[openLine], lineStarts[i] + lines[i].length]);
                openLine = -1;
                continue;
            }
        }

        // No start-of-line closer.  Check if the fence is glued to the end
        // of a content line (Bug 28).
        const endMatch = END_CLOSE_RE.exec(lines[i]);
        if (endMatch && endMatch[1][0] === openChar && endMatch[1].length >= openLen) {
            ranges.push([lineStarts[openLine], lineStarts[i] + lines[i].length]);
            openLine = -1;
        }
    }

    // Unterminated opener: do NOT extend to EOF.  This branch used to
    // exclude every line from the opener to EOF, but two real-world
    // failure modes proved that too aggressive:
    //
    //   1. A code-styled fence with a non-trivial info string that the
    //      author never closed properly (e.g. a single-line ``` block
    //      written as ` ```javascript code... ` that ends with content
    //      followed by ``` on the same line — not a valid CommonMark
    //      closer).  Excluding to EOF dropped every real `{% include %}`
    //      below it.
    //   2. A backtick run on the SAME line as a deflist marker
    //      (`:   ` + ``` + info), which our regex-based detector cannot
    //      pair correctly: it misses the real opener (the line starts
    //      with `:`, not a backtick), then mistakes the real closer for
    //      a fresh opener and walks the rest of the document into a
    //      ghost fence range.
    //
    // In both cases dropping the unterminated range is safe: the worst
    // we can do is incorrectly resolve an `{% include %}` that was
    // genuinely meant as code inside a malformed fence — and a fence
    // that is broken enough not to close is broken enough that the
    // surrounding markup is already ill-formed.

    return ranges;
}

export function resolveDependencies(this: LoaderContext, content: string) {
    const includes = [];
    // Filter out:
    // - comments — already handled by `resolveComments`;
    // - `{% included … %}` blocks — embedded include content (md2md output);
    // - fenced code blocks — `{% include %}` shown as a code example.
    // Indented (4-space) code blocks are NOT excluded: many docs author
    // include continuations with 4-space indentation inside list / tab / cut
    // structures, which markdown-it would parse as `code_block` only in
    // standalone context.
    const commentRanges = this.api.comments.get();
    const exclude = [
        ...commentRanges,
        ...findIncludedBlockRanges(content),
        // Pass the comment ranges so a fence run that lies inside an HTML
        // comment is not treated as a code block boundary (see Bug 26).
        ...findFencedCodeBlockRanges(content, commentRanges),
    ];

    const includeRegex = new RegExp(INCLUDE_REGEX.source, INCLUDE_REGEX.flags);

    let match;
    // eslint-disable-next-line no-cond-assign
    while ((match = includeRegex.exec(content))) {
        // Backtick directly before catches inline `{% include %}` (code span).
        if (content[match.index - 1] === '`') {
            continue;
        }

        const matchStart = match.index;
        const matchEnd = includeRegex.lastIndex;
        if (exclude.some(([exStart, exEnd]) => matchStart >= exStart && matchEnd <= exEnd)) {
            continue;
        }

        const link = findLink(match[0]) as string;
        // TODO: warn about non local urls
        const include = parseLocalUrl<IncludeInfo>(link);

        if (include && include.path) {
            const currentPath = this.path;
            const normalizedIncludePath = normalizePath(join(dirname(currentPath), include.path));

            if (normalizedIncludePath === currentPath) {
                this.logger.error('YFM016', `${currentPath}: The file is included in itself`);

                continue;
            }

            include.path = rebasePath(currentPath, include.path as RelativePath);
            include.link = link;
            include.match = content.slice(match.index, includeRegex.lastIndex);
            include.location = [match.index, includeRegex.lastIndex];

            includes.push(include);
        }
    }

    this.api.deps.set(filterRanges(exclude, includes));

    return content;
}
