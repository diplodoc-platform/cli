/**
 * Line-oriented markdown scanning shared by the deterministic checks.
 *
 * The checks compare markup structure, not rendering, so a lightweight
 * scanner is enough: it only needs to tell fenced code apart from prose.
 */

export type Fence = {
    /** Info string of the opening fence, e.g. `bash`. */
    info: string;
    /** Verbatim fence body. */
    content: string;
};

export type ProseLine = {
    /** 1-based line number in the page. */
    line: number;
    text: string;
};

export type ScannedPage = {
    /** Lines that are not part of fenced code blocks. */
    prose: ProseLine[];
    fences: Fence[];
};

type FenceOpen = {
    char: string;
    size: number;
    info: string;
};

function matchFenceOpen(line: string): FenceOpen | null {
    const trimmed = line.trimStart();
    const char = trimmed[0];

    if (char !== '`' && char !== '~') {
        return null;
    }

    let size = 0;
    while (trimmed[size] === char) {
        size++;
    }

    if (size < 3) {
        return null;
    }

    const info = trimmed.slice(size).trim();

    // A backtick info string cannot contain backticks (CommonMark).
    if (char === '`' && info.includes('`')) {
        return null;
    }

    return {char, size, info};
}

function matchFenceClose(line: string, fence: FenceOpen): boolean {
    const trimmed = line.trim();

    if (trimmed.length < fence.size) {
        return false;
    }

    for (const char of trimmed) {
        if (char !== fence.char) {
            return false;
        }
    }

    return true;
}

/**
 * Splits a page into prose lines and fenced code blocks.
 *
 * Fences follow CommonMark closing rules loosely: a block opened with
 * a run of N markers is closed by a line of at least N of the same
 * marker and nothing else.
 */
export function scanPage(content: string): ScannedPage {
    const lines = content.split('\n');
    const prose: ProseLine[] = [];
    const fences: Fence[] = [];

    let fence: (FenceOpen & {body: string[]}) | null = null;

    for (let index = 0; index < lines.length; index++) {
        const text = lines[index];

        if (fence) {
            if (matchFenceClose(text, fence)) {
                fences.push({info: fence.info, content: fence.body.join('\n')});
                fence = null;
            } else {
                fence.body.push(text);
            }
            continue;
        }

        const open = matchFenceOpen(text);
        if (open) {
            fence = {...open, body: []};
            continue;
        }

        prose.push({line: index + 1, text});
    }

    // An unterminated fence is still a fence: keep it for comparison.
    if (fence) {
        fences.push({info: fence.info, content: fence.body.join('\n')});
    }

    return {prose, fences};
}

/**
 * Joins prose lines back into a single text, for checks that do not
 * care about line positions.
 */
export function proseText(page: ScannedPage): string {
    return page.prose.map((line) => line.text).join('\n');
}
