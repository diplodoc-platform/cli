import type {Fragment} from './parse';

export type Extracted = {
    code: string;
    /** 1-based inclusive line range in the source file, used to build the permalink. */
    start: number;
    end: number;
};

export class FragmentError extends Error {}

type Marker = {kind: 'start' | 'end'; name: string};

/**
 * Region markers are matched anywhere on the line and ignore the comment prefix,
 * which makes them work for any language without a per-language table.
 *
 * Two conventions are accepted:
 *  - `#region name` / `#endregion [name]` — VitePress / IDE folding markers;
 *  - `[START name]` / `[END name]` — the convention used across Google sample repos.
 */
const END_MARKERS = [/\[END\s+([\w.\-/]+)\s*\]/, /#endregion(?:\s+([\w.\-/]+))?/];
const START_MARKERS = [/\[START\s+([\w.\-/]+)\s*\]/, /#region\s+([\w.\-/]+)/];

function marker(line: string): Marker | null {
    for (const regex of END_MARKERS) {
        const match = regex.exec(line);
        if (match) {
            return {kind: 'end', name: match[1] || ''};
        }
    }

    for (const regex of START_MARKERS) {
        const match = regex.exec(line);
        if (match) {
            return {kind: 'start', name: match[1]};
        }
    }

    return null;
}

function dedent(lines: string[]): string[] {
    const indents = lines
        .filter((line) => line.trim())
        .map((line) => (/^[ \t]*/.exec(line) as RegExpExecArray)[0].length);

    const common = indents.length ? Math.min(...indents) : 0;

    return common ? lines.map((line) => line.slice(common)) : lines;
}

/**
 * Drops blank lines around the fragment and reports how many were dropped on each
 * side, so the caller can keep the reported line range pointing at real code.
 */
function trim(lines: string[]): {lines: string[]; leading: number; trailing: number} {
    let start = 0;
    let end = lines.length;

    while (start < end && !lines[start].trim()) {
        start++;
    }

    while (end > start && !lines[end - 1].trim()) {
        end--;
    }

    return {lines: lines.slice(start, end), leading: start, trailing: lines.length - end};
}

function extractRegion(lines: string[], name: string) {
    const open: string[] = [];
    const picked: string[] = [];

    let start = -1;
    let end = -1;

    for (let index = 0; index < lines.length; index++) {
        const found = marker(lines[index]);

        if (found) {
            if (found.kind === 'start') {
                open.push(found.name);

                if (found.name === name && start === -1) {
                    // Body starts on the next line; `index` is 0-based.
                    start = index + 2;
                }
            } else {
                // A bare `#endregion` closes the innermost open region.
                const closed = found.name || open[open.length - 1];
                const position = open.lastIndexOf(closed);

                if (position !== -1) {
                    open.splice(position, 1);
                }

                if (closed === name && start !== -1 && end === -1) {
                    end = index;
                }
            }

            // Markers never reach the output, including markers of nested regions.
            continue;
        }

        if (open.includes(name)) {
            picked.push(lines[index]);
        }
    }

    if (start === -1) {
        throw new FragmentError(`region '${name}' not found`);
    }

    if (end === -1) {
        throw new FragmentError(`region '${name}' is not closed`);
    }

    return {lines: picked, start, end};
}

function extractLines(lines: string[], from: number, to: number) {
    if (from > lines.length) {
        throw new FragmentError(
            `line range ${from}-${to} is out of bounds, file has ${lines.length} lines`,
        );
    }

    const end = Math.min(to, lines.length);

    return {lines: lines.slice(from - 1, end), start: from, end};
}

/**
 * Cuts the requested fragment out of a source file.
 *
 * Always reports the resolved line range, so a region reference in the document
 * still produces an exact line anchor in the generated source link.
 */
export function extract(
    content: string,
    fragment: Fragment | null,
    shouldDedent = true,
): Extracted {
    // Normalized to LF: a CRLF source file would otherwise leave a stray `\r` on
    // every line of a snippet spliced into an LF document.
    const lines = content
        .split('\n')
        .map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));

    let selected: {lines: string[]; start: number; end: number};

    if (fragment === null) {
        selected = {lines, start: 1, end: lines.length};
    } else if (fragment.type === 'region') {
        selected = extractRegion(lines, fragment.name);
    } else {
        selected = extractLines(lines, fragment.start, fragment.end);
    }

    const trimmed = trim(selected.lines);
    const body = shouldDedent ? dedent(trimmed.lines) : trimmed.lines;

    if (!body.length) {
        throw new FragmentError('selected fragment is empty');
    }

    // Reported in source-file coordinates rather than derived from the emitted
    // code: stripped markers of nested regions would otherwise shift the anchor.
    const start = selected.start + trimmed.leading;
    const end = selected.end - trimmed.trailing;

    return {
        code: body.join('\n'),
        start,
        end: Math.max(start, end),
    };
}
