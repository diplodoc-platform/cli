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
function findFencedCodeBlockRanges(content: string): Location[] {
    const ranges: Location[] = [];
    const lines = content.split('\n');

    const lineStarts: number[] = new Array(lines.length);
    let pos = 0;
    for (let i = 0; i < lines.length; i++) {
        lineStarts[i] = pos;
        pos += lines[i].length + 1;
    }

    let openLine = -1;
    let openChar = '';
    let openLen = 0;

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trimStart();
        const fenceMatch = /^(`{3,}|~{3,})/.exec(trimmed);
        if (!fenceMatch) {
            continue;
        }
        // Indent is intentionally not limited to ≤ 3 spaces (CommonMark).
        // Fences inside lists / definition lists / cuts can use deeper indent
        // (e.g. `1.` + 4 spaces).  For the purpose of "is this an include
        // shown as code?" we treat any ``` / ~~~ run as a fence.
        const fence = fenceMatch[1];
        if (openLine < 0) {
            // Opening: backtick fence info string must not contain backticks.
            const info = trimmed.slice(fence.length);
            if (fence[0] === '`' && info.includes('`')) {
                continue;
            }
            openLine = i;
            openChar = fence[0];
            openLen = fence.length;
        } else if (fence[0] === openChar && fence.length >= openLen) {
            // Closing fence: same char, length ≥ open, info string empty.
            const after = trimmed.slice(fence.length).trim();
            if (after === '') {
                const start = lineStarts[openLine];
                // End at the LAST char of the close-fence line content
                // (excluding the trailing newline).  `filterRanges`
                // below treats touching ranges (`exclude[1] === point[0]`)
                // as overlapping, so an exclusive end on the newline
                // position would swallow an `{% include %}` that
                // starts on the very next line.
                const end = lineStarts[i] + lines[i].length;
                ranges.push([start, end]);
                openLine = -1;
            }
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
    const exclude = [
        ...this.api.comments.get(),
        ...findIncludedBlockRanges(content),
        ...findFencedCodeBlockRanges(content),
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
