import type {Collect, Location} from '~/core/markdown';
import type {LoaderContext} from '~/core/markdown/loader';
import type {CodeDirective} from './parse';

import {dirname, join} from 'node:path';

import {findFencedCodeBlockRanges} from '~/core/markdown';
import {normalizePath} from '~/core/utils';

import {removeCommonIndent, selectCodeFragment} from './fragment';
import {parseCodeDirective} from './parse';
import {renderCodeFence} from './render';

const CODE_DIRECTIVE = /{%\s*code(?=\s|%})[\s\S]*?%}/g;
const ERROR_PLACEHOLDER = '<!-- code directive failed -->';

export const collect: Collect = async function (content) {
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
            ),
        );
    }

    this.api.codeSources.set([...codeSources]);
    output.push(content.slice(cursor));
    return output.join('');
};

async function expandDirective(
    context: LoaderContext,
    content: string,
    start: number,
    source: string,
    fencedRanges: Location[],
    commentRanges: Location[],
    inlineCodeRanges: Location[],
    codeSources: Set<NormalizedPath>,
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
    const target = resolveCodePath(context.path, directive.path);
    if (target === '..' || target.startsWith('../')) {
        context.logger.error(
            formatMessage(context.path, `source path "${directive.path}" escapes the input root`),
        );
        return indentReplacement(content, start, ERROR_PLACEHOLDER);
    }

    codeSources.add(target);
    const replacement = await readAndRender(context, directive, target);
    return indentReplacement(content, start, replacement);
}

async function readAndRender(
    context: LoaderContext,
    directive: CodeDirective,
    target: NormalizedPath,
): Promise<string> {
    let source: string;
    try {
        source = await context.readFile(target);
    } catch (error) {
        context.logger.error(formatReadError(context.path, directive.path, error));
        return ERROR_PLACEHOLDER;
    }

    try {
        const selected = selectCodeFragment(source, directive.lines);
        for (const warning of selected.warnings) {
            context.logger.warn(
                formatMessage(
                    context.path,
                    `${warning.message} while including "${directive.path}"`,
                ),
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

function resolveCodePath(currentPath: NormalizedPath, sourcePath: string): NormalizedPath {
    const target = sourcePath.startsWith('/')
        ? sourcePath.slice(1)
        : join(dirname(currentPath), sourcePath);

    return normalizePath(target);
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
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    const kind = code === 'ENOENT' ? 'file was not found' : 'file could not be read';

    return formatMessage(path, `${kind}: "${sourcePath}"`);
}
