export type Fence = {
    /** The run of fence characters itself, e.g. ``` or ~~~~. */
    markup: string;
    /** Everything after the run on the opening line. */
    info: string;
};

const FENCE_RUN_RE = /^(`{3,}|~{3,})/;

/**
 * Matches a CommonMark fence opener at the start of `line`.
 *
 * A fence is a run of at least three backticks or tildes. The info string
 * of a backtick fence must not contain backticks, otherwise the run is
 * inline code rather than a fence opener.
 *
 * Leading whitespace is NOT stripped: callers decide how much indent they
 * accept (CommonMark allows three spaces, but fences inside lists, cuts
 * and definition lists are indented deeper) and whether a container
 * marker may precede the run.
 */
export function matchFenceOpen(line: string): Fence | null {
    const match = FENCE_RUN_RE.exec(line);

    if (!match) {
        return null;
    }

    const markup = match[1];
    const info = line.slice(markup.length);

    if (markup[0] === '`' && info.includes('`')) {
        return null;
    }

    return {markup, info};
}

/**
 * Tells whether `line` is a CommonMark closer for a fence opened with
 * `markup`: a run of the same character, at least as long as the opening
 * one, with nothing but whitespace after it.
 *
 * YFM authors do glue table separators onto the closing line; callers
 * that accept those inspect the tail themselves through `fenceCloseTail`.
 */
export function isFenceClose(line: string, markup: string): boolean {
    return fenceCloseTail(line, markup) === '';
}

/**
 * Returns the trimmed content that follows a closing fence run, or null
 * when `line` does not close a fence opened with `markup`. An empty
 * string means a plain CommonMark closer.
 */
export function fenceCloseTail(line: string, markup: string): string | null {
    const match = FENCE_RUN_RE.exec(line);

    if (!match || match[1][0] !== markup[0] || match[1].length < markup.length) {
        return null;
    }

    return line.slice(match[1].length).trim();
}
