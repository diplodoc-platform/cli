import type {Collect, Location} from '~/core/markdown';
import type {LoaderContext} from '~/core/markdown/loader';
import type {CodeDirective} from './parse';

import {dirname, join} from 'node:path';

import {findFencedCodeBlockRanges} from '~/core/markdown';
import {normalizePath} from '~/core/utils';

import {removeCommonIndent, selectCodeFragment} from './fragment';
import {parseCodeDirective, parseCodeTarget} from './parse';
import {renderCodeFence} from './render';
import {CodeSources, isLiteralProbeMiss, isMissingCodeSource} from './sources';

const CODE_DIRECTIVE = /{%\s*code(?=\s|%})[\s\S]*?%}/g;
const ERROR_PLACEHOLDER = '<!-- code directive failed -->';

/** Creates a collector whose source cache is scoped to one build run. */
export function createCollect(getRevision: () => number = () => 0): Collect {
    const sources = new CodeSources(getRevision);
    return async function (content) {
        // This collect runs before `resolveComments` registers comment ranges,
        // so detect HTML comments here to keep a commented-out `{% code %}`
        // inert — mirroring how `{% include %}` is skipped inside comments.
        const commentRanges = findCommentRanges(content);
        const fencedRanges = findFencedCodeBlockRanges(content, commentRanges);
        const inlineCodeRanges = findInlineCodeRanges(content, [...commentRanges, ...fencedRanges]);
        const matches = [...content.matchAll(CODE_DIRECTIVE)];
        const output: string[] = [];
        const codeSources = new Set<NormalizedPath>();
        let cursor = 0;

        for (const match of matches) {
            const start = match.index;
            output.push(content.slice(cursor, start));
            cursor = start + match[0].length;
            output.push(
                await expandDirective(
                    this,
                    content,
                    start,
                    match[0],
                    fencedRanges,
                    commentRanges,
                    inlineCodeRanges,
                    codeSources,
                    sources,
                ),
            );
        }

        this.api.codeSources.set([...codeSources]);
        output.push(content.slice(cursor));
        return output.join('');
    };
}

async function expandDirective(
    context: LoaderContext,
    content: string,
    start: number,
    source: string,
    fencedRanges: Location[],
    commentRanges: Location[],
    inlineCodeRanges: Location[],
    codeSources: Set<NormalizedPath>,
    sources: CodeSources,
): Promise<string> {
    const end = start + source.length;
    if (
        isInsideRange(start, end, fencedRanges) ||
        isInsideRange(start, end, commentRanges) ||
        isInsideRange(start, end, inlineCodeRanges)
    ) {
        return source;
    }

    const parsed = parseCodeDirective(source);
    if (parsed.passthrough) {
        return source;
    }

    for (const warning of parsed.warnings) {
        context.logger.warn(formatMessage(context.path, warning));
    }

    if (!parsed.directive) {
        context.logger.error(formatMessage(context.path, parsed.error || 'invalid directive'));
        return indentReplacement(content, start, ERROR_PLACEHOLDER);
    }

    const directive = parsed.directive;
    if (directive.lines !== undefined) {
        context.logger.info(
            formatMessage(
                context.path,
                'attribute "lines" is deprecated; use a named region in "path#region" instead',
            ),
        );
    }
    const replacement = await readAndRender(context, directive, codeSources, sources);
    return indentReplacement(content, start, replacement);
}

async function readAndRender(
    context: LoaderContext,
    directive: CodeDirective,
    codeSources: Set<NormalizedPath>,
    sources: CodeSources,
): Promise<string> {
    const resolved = await resolveSource(context, directive, codeSources, sources);
    if ('error' in resolved) {
        context.logger.error(resolved.error);
        return ERROR_PLACEHOLDER;
    }
    const {source, path, region} = resolved;

    try {
        const selected =
            region === undefined
                ? selectCodeFragment(source.content, directive.lines)
                : {content: source.selectRegion(region), warnings: []};
        for (const warning of selected.warnings) {
            context.logger.warn(
                formatMessage(context.path, `${warning.message} while including "${path}"`),
            );
        }

        const fragment = directive.keepIndents
            ? selected.content
            : removeCommonIndent(selected.content);
        return renderCodeFence(fragment, directive.lang);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        context.logger.error(
            formatMessage(context.path, `${message} while including "${directive.path}"`),
        );
        return ERROR_PLACEHOLDER;
    }
}

async function resolveSource(
    context: LoaderContext,
    directive: CodeDirective,
    codeSources: Set<NormalizedPath>,
    sources: CodeSources,
): Promise<
    | {source: Awaited<ReturnType<CodeSources['read']>>; path: string; region?: string}
    | {error: string}
> {
    const literal = resolveLiteralPath(context.path, directive.path);
    if (literal && !('error' in literal)) {
        codeSources.add(literal.target);
        try {
            return {source: await sources.read(context, literal.target), path: directive.path};
        } catch (error) {
            if (!isLiteralProbeMiss(error) || !directive.path.includes('#')) {
                return {error: formatReadError(context.path, directive.path, error)};
            }
        }
    }

    const selected = parseCodeTarget(directive.path, directive.lines);
    if ('error' in selected) {
        return {error: formatMessage(context.path, selected.error)};
    }
    const resolved = resolveCodePath(context.path, selected.path);
    if ('error' in resolved) {
        return {error: formatMessage(context.path, resolved.error)};
    }
    codeSources.add(resolved.target);
    try {
        return {
            source: await sources.read(context, resolved.target),
            path: selected.path,
            region: selected.region,
        };
    } catch (error) {
        return {error: formatReadError(context.path, selected.path, error)};
    }
}

function resolveLiteralPath(currentPath: NormalizedPath, sourcePath: string) {
    const separator = sourcePath.lastIndexOf('#');
    // A selector is opaque: resolving its dot segments could name another file.
    if (separator >= 0 && /[\\/]\.{1,2}(?:[\\/]|$)/.test(sourcePath.slice(separator + 1))) {
        return undefined;
    }
    return resolveCodePath(currentPath, sourcePath);
}

function resolveCodePath(
    currentPath: NormalizedPath,
    sourcePath: string,
): {target: NormalizedPath} | {error: string} {
    const target = sourcePath.startsWith('/')
        ? sourcePath.slice(1)
        : join(dirname(currentPath), sourcePath);

    const normalized = normalizePath(target);
    if (normalized === '..' || normalized.startsWith('../')) {
        return {error: `source path "${sourcePath}" escapes the input root`};
    }
    return {target: normalized};
}

function indentReplacement(content: string, start: number, replacement: string) {
    const lineStart = content.lastIndexOf('\n', start - 1) + 1;
    const prefix = content.slice(lineStart, start);

    if (!/^\s*$/.test(prefix)) {
        return replacement;
    }

    return replacement.replace(/\n/g, `\n${prefix}`);
}

function isInsideRange(start: number, end: number, ranges: Location[]) {
    return ranges.some(([rangeStart, rangeEnd]) => start >= rangeStart && end <= rangeEnd);
}

function findInlineCodeRanges(content: string, excludedRanges: Location[]): Location[] {
    const ranges: Location[] = [];
    const openers = new Map<number, number>();
    let previousEnd = 0;

    for (const match of content.matchAll(/`+/g)) {
        const start = match.index;
        const end = start + match[0].length;
        if (/\n[ \t]*\n/.test(content.slice(previousEnd, start))) {
            openers.clear();
        }
        previousEnd = end;

        if (isInsideRange(start, end, excludedRanges)) {
            openers.clear();
            continue;
        }

        let slashes = 0;
        while (content[start - slashes - 1] === '\\') {
            slashes++;
        }
        if (slashes % 2) {
            continue;
        }

        const length = match[0].length;
        const opener = openers.get(length);
        if (opener === undefined) {
            openers.set(length, start);
            continue;
        }

        ranges.push([opener, end]);
        for (const [openLength, openStart] of openers) {
            if (openStart >= opener) {
                openers.delete(openLength);
            }
        }
    }

    return ranges;
}

function findCommentRanges(content: string): Location[] {
    const ranges: Location[] = [];
    let cursor = 0;

    while (cursor < content.length) {
        const start = content.indexOf('<!--', cursor);
        if (start < 0) {
            break;
        }
        const close = content.indexOf('-->', start + 4);
        if (close < 0) {
            break;
        }
        cursor = close + 3;
        ranges.push([start, cursor]);
    }

    return ranges;
}

function formatMessage(path: NormalizedPath, message: string) {
    return `${path}: Code directive: ${message}.`;
}

function formatReadError(path: NormalizedPath, sourcePath: string, error: unknown) {
    const kind = isMissingCodeSource(error) ? 'file was not found' : 'file could not be read';

    return formatMessage(path, `${kind}: "${sourcePath}"`);
}
