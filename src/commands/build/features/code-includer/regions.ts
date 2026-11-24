type Region = {start: number; end: number};
type OpenRegion = {name: string; start: number; line: number};
type Marker = {closing: boolean; name?: string};

export const REGION_NAME = /^[\w./-]+$/;
const BRACKET_MARKER = /\[(START|END)(?=[ \t\]])/;
const HASH_MARKER = /#(end)?region(?=[ \t]|$|\*\/|-->)(?:[ \t]+([^\s]+))?/;

/**
 * Indexes all region boundaries in one pass. Marker lines are omitted from the
 * shared line array, so nested regions do not require per-region text copies.
 */
export class CodeRegions {
    private readonly lines: string[] = [];
    private readonly regions = new Map<string, Region>();

    constructor(source: string) {
        const opened: OpenRegion[] = [];
        const names = new Set<string>();
        let lineNumber = 0;

        for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
            lineNumber++;
            const marker = parseMarker(line);
            if (!marker) {
                this.lines.push(line);
                continue;
            }

            if (marker.name !== undefined && !REGION_NAME.test(marker.name)) {
                throw new Error(`invalid region name "${marker.name}" at line ${lineNumber}`);
            }

            if (marker.closing) {
                this.closeRegion(marker.name, opened, lineNumber);
            } else {
                opened.push(this.openRegion(marker.name, names, lineNumber));
            }
        }

        const unclosed = opened[opened.length - 1];
        if (unclosed) {
            throw new Error(
                `region "${unclosed.name}" opened at line ${unclosed.line} is not closed`,
            );
        }
    }

    /** Returns a named region without marker lines or surrounding blank lines. */
    select(name: string): string {
        const region = this.regions.get(name);
        if (!region) {
            throw new Error(`region "${name}" was not found`);
        }

        let {start, end} = region;
        while (start < end && !this.lines[start].trim()) {
            start++;
        }
        while (end > start && !this.lines[end - 1].trim()) {
            end--;
        }
        if (start === end) {
            throw new Error(`region "${name}" is empty`);
        }
        return this.lines.slice(start, end).join('\n');
    }

    private openRegion(name: string | undefined, names: Set<string>, line: number): OpenRegion {
        if (!name) {
            throw new Error(`region name is missing at line ${line}`);
        }
        if (names.has(name)) {
            throw new Error(`region "${name}" is duplicated at line ${line}`);
        }
        names.add(name);
        return {name, start: this.lines.length, line};
    }

    private closeRegion(name: string | undefined, opened: OpenRegion[], line: number) {
        const current = opened.pop();
        if (!current) {
            throw new Error(`region "${name || ''}" has no opening marker at line ${line}`);
        }
        if (name !== undefined && name !== current.name) {
            throw new Error(`region "${name}" closes before "${current.name}" at line ${line}`);
        }
        this.regions.set(current.name, {start: current.start, end: this.lines.length});
    }
}

function parseMarker(line: string): Marker | undefined {
    // Like the proposed source conventions, markers are language independent:
    // comment prefixes are not parsed and the marker may occur anywhere on a line.
    const bracket = BRACKET_MARKER.exec(line);
    if (bracket) {
        const nameStart = bracket.index + bracket[0].length;
        const closingBracket = line.indexOf(']', nameStart);
        if (closingBracket >= 0) {
            return {
                closing: bracket[1] === 'END',
                name: line.slice(nameStart, closingBracket).trim(),
            };
        }
    }

    const hash = HASH_MARKER.exec(line);
    if (hash) {
        const closing = Boolean(hash[1]);
        const name = hash[2];
        // A block-comment terminator after a bare closing marker is not a name.
        const commentEnd = closing && (name === '*/' || name === '-->');
        return {closing, name: commentEnd ? undefined : name};
    }
    return undefined;
}
