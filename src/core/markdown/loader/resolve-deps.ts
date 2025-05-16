import type {IncludeInfo} from '../types';
import type {LoaderContext} from '../loader';

import {parseLocalUrl, rebasePath} from '~/core/utils';
import {filterRanges, findLinks} from '../utils';

export function resolveDependencies(this: LoaderContext, content: string) {
    const includes = [];
    const exclude = [...this.api.comments.get()];

    // Include example: {% include [createfolder](create-folder.md) %}
    // Regexp result: [createfolder](create-folder.md)
    const INCLUDE_CONTENTS = /{%\s*include\s*.+?%}/g;

    let match;
    // eslint-disable-next-line no-cond-assign
    while ((match = INCLUDE_CONTENTS.exec(content))) {
        // Ugly workaround for include examples
        // TODO: rewrite all inspect code on markdown-it parsing with minimal set of plugins
        if (content[match.index - 1] === '`') {
            continue;
        }

        const link = findLinks(match[0])[0] as string;
        // TODO: warn about non local urls
        const include = parseLocalUrl<IncludeInfo>(link);

        if (include) {
            include.signpath = rebasePath(
                this.path,
                signlink(include.path, this.sign) as RelativePath,
            );
            include.path = rebasePath(this.path, include.path as RelativePath);
            include.link = link;
            include.signlink = signlink(link, this.sign);
            include.location = [match.index, INCLUDE_CONTENTS.lastIndex];

            includes.push(include);
        }
    }

    this.api.deps.set(filterRanges(exclude, includes));

    return content;
}

function signlink(link: string, sign: string) {
    if (!sign) {
        return link;
    }

    const [path, hash] = link.split('#');
    const [_, name, ext] = path.match(/(.*)\.(.*?)$/) as string[];

    return `${name}-${sign}.${ext}${hash ? '#' + hash : ''}`;
}
