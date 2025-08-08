import type {IncludeInfo} from '../types';
import type {LoaderContext} from '../loader';

import {parseLocalUrl, rebasePath} from '~/core/utils';
import {filterRanges, findLink} from '../utils';

export function resolveDependencies(this: LoaderContext, content: string) {
    const includes = [];
    const exclude = [...this.api.comments.get()];

    // Include example: {% include [createfolder](create-folder.md) %}
    // Regexp result: [createfolder](create-folder.md)
    const INCLUDE_CONTENTS = /(\r?\n\s+)?({%\s*include\s*.+?%})/g;

    let match;
    // eslint-disable-next-line no-cond-assign
    while ((match = INCLUDE_CONTENTS.exec(content))) {
        // Ugly workaround for include examples
        // TODO: rewrite all inspect code on markdown-it parsing with minimal set of plugins
        match.index = match.index + (match[1]?.length || 0);
        if (content[match.index - 1] === '`') {
            continue;
        }

        const link = findLink(match[2]) as string;
        // TODO: warn about non local urls
        const include = parseLocalUrl<IncludeInfo>(link);

        if (include) {
            include.path = rebasePath(this.path, include.path as RelativePath);
            include.link = link;
            include.match = content.slice(match.index, INCLUDE_CONTENTS.lastIndex);
            include.location = [match.index, INCLUDE_CONTENTS.lastIndex];
            include.indent = match[1]?.replace(/\r?\n/g, '').length || 0;

            includes.push(include);
        }
    }

    this.api.deps.set(filterRanges(exclude, includes));

    return content;
}
