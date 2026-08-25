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

const FENCE_OPEN = /^\s*(`{3,}|~{3,})(.*)$/;

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

    let fence: {char: string; size: number; info: string; body: string[]} | null = null;

    for (let index = 0; index < lines.length; index++) {
        const text = lines[index];

        if (fence) {
            const {char: fenceChar, size: fenceSize} = fence;
            const trimmed = text.trim();
            const isClose =
                trimmed.length >= fenceSize &&
                trimmed.split('').every((char) => char === fenceChar);

            if (isClose) {
                fences.push({info: fence.info, content: fence.body.join('\n')});
                fence = null;
            } else {
                fence.body.push(text);
            }
            continue;
        }

        const open = FENCE_OPEN.exec(text);
        if (open && !open[2].includes(open[1][0])) {
            fence = {
                char: open[1][0],
                size: open[1].length,
                info: open[2].trim(),
                body: [],
            };
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
