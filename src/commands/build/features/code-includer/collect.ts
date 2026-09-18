import type {Collect, Location} from '~/core/markdown';

import {dirname, join} from 'node:path';

import {findFencedCodeBlockRanges} from '~/core/markdown';
import {normalizePath} from '~/core/utils';

import {removeCommonIndent, selectCodeFragment} from './fragment';
import {parseCodeDirective} from './parse';
import {renderCodeFence} from './render';

const CODE_DIRECTIVE = /{%\s*code(?=\s|%})[\s\S]*?%}/g;
const HTML_COMMENT = /<!-{2,}[\s\S]*?-{2,}>/g;
const ERROR_PLACEHOLDER = '<!-- code directive failed -->';

export const collect: Collect = async function (content) {
    const fencedRanges = findFencedCodeBlockRanges(content);
    // This collect runs before `resolveComments` registers comment ranges,
    // so detect HTML comments here to keep a commented-out `{% code %}`
    // inert — mirroring how `{% include %}` is skipped inside comments.
    const commentRanges = findCommentRanges(content);
    const matches = [...content.matchAll(CODE_DIRECTIVE)];
    const output: string[] = [];
    let cursor = 0;

    for (const match of matches) {
        const start = match.index;
        const end = start + match[0].length;
        output.push(content.slice(cursor, start));
        cursor = end;

        if (
            content[start - 1] === '`' ||
            isInsideRange(start, end, fencedRanges) ||
            isInsideRange(start, end, commentRanges)
        ) {
            output.push(match[0]);
            continue;
        }

        const parsed = parseCodeDirective(match[0]);
        if (parsed.passthrough) {
            output.push(match[0]);
            continue;
        }

        for (const warning of parsed.warnings) {
            this.logger.warn(formatMessage(this.path, warning));
        }

        if (!parsed.directive) {
            this.logger.error(formatMessage(this.path, parsed.error || 'invalid directive'));
            output.push(indentReplacement(content, start, ERROR_PLACEHOLDER));
            continue;
        }

        const directive = parsed.directive;
        const target = resolveCodePath(this.path, directive.path);

        if (target === '..' || target.startsWith('../')) {
            this.logger.error(
                formatMessage(this.path, `source path "${directive.path}" escapes the input root`),
            );
            output.push(indentReplacement(content, start, ERROR_PLACEHOLDER));
            continue;
        }

        let source: string;
        try {
            source = await this.readFile(target);
        } catch (error) {
            this.logger.error(formatReadError(this.path, directive.path, error));
            output.push(indentReplacement(content, start, ERROR_PLACEHOLDER));
            continue;
        }

        try {
            const selected = selectCodeFragment(source, directive.lines);
            for (const warning of selected.warnings) {
                this.logger.warn(
                    formatMessage(
                        this.path,
                        `${warning.message} while including "${directive.path}"`,
                    ),
                );
            }

            const fragment = directive.keepIndents
                ? selected.content
                : removeCommonIndent(selected.content);
            const rendered = renderCodeFence(fragment, directive.lang);
            output.push(indentReplacement(content, start, rendered));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(
                formatMessage(this.path, `${message} while including "${directive.path}"`),
            );
            output.push(indentReplacement(content, start, ERROR_PLACEHOLDER));
        }
    }

    output.push(content.slice(cursor));
    return output.join('');
};

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

function findCommentRanges(content: string): Location[] {
    const ranges: Location[] = [];
    const regexp = new RegExp(HTML_COMMENT.source, HTML_COMMENT.flags);

    let match;
    // eslint-disable-next-line no-cond-assign
    while ((match = regexp.exec(content))) {
        ranges.push([match.index, regexp.lastIndex]);
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
