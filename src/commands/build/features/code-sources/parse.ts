import {findFencedCodeBlockRanges} from '~/core/markdown';

/**
 * Selector of a fragment inside a source file.
 *
 * `region` is the recommended form: it survives refactoring in the source repo.
 * `lines` is kept for sources whose owners will not add markers, and is reported
 * as a warning by the collect plugin.
 */
export type Fragment = {type: 'region'; name: string} | {type: 'lines'; start: number; end: number};

export type Directive = {
    /** Link caption. Empty when the author left the brackets empty. */
    caption: string;
    /** Declared source name — the part before `:` in the target. */
    source: string;
    /** File path inside the source tree. */
    path: string;
    /** Fragment selector. `null` means the whole file. */
    fragment: Fragment | null;
    /** Language override for the resulting fence. `null` means "infer from extension". */
    lang: string | null;
    /** Strip common leading indentation. */
    dedent: boolean;
    /** Emit the "view source" link under the fence. */
    link: boolean;
};

export type DirectiveMatch = {
    /** Raw directive text, replaced verbatim in the content. */
    match: string;
    /** `[start, end)` position of `match` in the original content. */
    location: [number, number];
    /** Parsed directive, or `null` when `error` is set. */
    directive: Directive | null;
    /** Human readable reason the directive could not be parsed. */
    error: string | null;
};

/**
 * `{% include-code [caption](source:path#fragment) key=value %}`
 *
 * The attribute tail intentionally excludes `%` so that an unterminated directive
 * does not swallow the rest of the document.
 */
const DIRECTIVE_REGEX = /{%\s*include-code\s+\[([^\]]*)\]\(\s*([^)\s]+)\s*\)([^%]*)%}/g;

const TARGET_REGEX = /^([\w-]+):([^#]+?)(?:#(.+))?$/;

const LINES_REGEX = /^L(\d+)(?:-L?(\d+))?$/;

const ATTRS_REGEX = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;

const REGION_NAME_REGEX = /^[\w.\-/]+$/;

function parseAttrs(tail: string): Hash<string> {
    const attrs: Hash<string> = {};

    for (const match of tail.matchAll(ATTRS_REGEX)) {
        const [, key, quoted, singleQuoted, bare] = match;
        attrs[key] = quoted ?? singleQuoted ?? bare;
    }

    return attrs;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined) {
        return fallback;
    }

    return value !== 'false' && value !== 'no' && value !== '0';
}

function parseFragment(raw: string | undefined): Fragment | null {
    if (!raw) {
        return null;
    }

    const lines = LINES_REGEX.exec(raw);
    if (lines) {
        const start = Number(lines[1]);
        const end = lines[2] === undefined ? start : Number(lines[2]);

        if (start < 1 || end < start) {
            throw new Error(`invalid line range '${raw}'`);
        }

        return {type: 'lines', start, end};
    }

    if (!REGION_NAME_REGEX.test(raw)) {
        throw new Error(`invalid region name '${raw}'`);
    }

    return {type: 'region', name: raw};
}

function parseTarget(target: string) {
    const match = TARGET_REGEX.exec(target);

    if (!match) {
        throw new Error(
            `invalid target '${target}', expected '<source>:<path>' or '<source>:<path>#<region>'`,
        );
    }

    const [, source, path, fragment] = match;

    // The path is later joined with a source root that lives outside the project
    // scope, so traversal has to be rejected here rather than relied upon to fail
    // later in the sandbox check.
    if (path.split('/').includes('..')) {
        throw new Error(`path '${path}' must not escape the source root`);
    }

    return {source, path, fragment: parseFragment(fragment)};
}

/**
 * Finds every `include-code` directive in the content.
 *
 * Malformed directives are returned with `error` set instead of throwing, so that
 * one broken directive does not hide the rest of the file from the author.
 */
export function parseDirectives(content: string): DirectiveMatch[] {
    if (!content.includes('include-code')) {
        return [];
    }

    // Mirrors `resolveDependencies`: a directive shown as a code example must be
    // left alone. Without this, documenting the feature splices a resolved fence
    // inside the fence that was demonstrating it, producing broken markdown.
    const fences = findFencedCodeBlockRanges(content);

    const matches: DirectiveMatch[] = [];

    for (const match of content.matchAll(DIRECTIVE_REGEX)) {
        const [text, caption, target, tail] = match;
        const location: [number, number] = [match.index, match.index + text.length];

        // A backtick directly before catches an inline code span, same heuristic
        // as the one guarding `{% include %}`.
        if (content[location[0] - 1] === '`') {
            continue;
        }

        if (fences.some(([from, to]) => location[0] >= from && location[1] <= to)) {
            continue;
        }

        try {
            const {source, path, fragment} = parseTarget(target);
            const attrs = parseAttrs(tail);

            matches.push({
                match: text,
                location,
                directive: {
                    caption,
                    source,
                    path,
                    fragment,
                    lang: attrs.lang ?? null,
                    dedent: parseBool(attrs.dedent, true),
                    link: parseBool(attrs.link, true),
                },
                error: null,
            });
        } catch (error) {
            matches.push({
                match: text,
                location,
                directive: null,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    return matches;
}
