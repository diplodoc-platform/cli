import type {IncludeInfo} from '../types';
import type {LoaderContext} from '../loader';

import {dirname, join} from 'node:path';

import {normalizePath, parseLocalUrl, rebasePath} from '~/core/utils';

import {INCLUDE_REGEX, filterRanges, findIncludedBlockRanges, findLink} from '../utils';

export function resolveDependencies(this: LoaderContext, content: string) {
    const includes = [];
    const exclude = [...this.api.comments.get(), ...findIncludedBlockRanges(content)];

    let match;
    // eslint-disable-next-line no-cond-assign
    while ((match = INCLUDE_REGEX.exec(content))) {
        // Ugly workaround for include examples
        // TODO: rewrite all inspect code on markdown-it parsing with minimal set of plugins
        if (content[match.index - 1] === '`') {
            continue;
        }

        const matchStart = match.index;
        const matchEnd = INCLUDE_REGEX.lastIndex;
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
            include.match = content.slice(match.index, INCLUDE_REGEX.lastIndex);
            include.location = [match.index, INCLUDE_REGEX.lastIndex];

            includes.push(include);
        }
    }

    this.api.deps.set(filterRanges(exclude, includes));

    return content;
}
