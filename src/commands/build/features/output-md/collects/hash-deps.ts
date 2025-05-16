import type {Collect} from '~/core/markdown';

import {replaceAll} from '~/core/utils';

export const hashDeps: Collect = function hashDaps(markdown) {
    const deps = this.api.deps.get();

    return deps.reduceRight((content, {link, signlink, location}) => {
        const [from, to] = location;

        if (link !== signlink) {
            const remove = content.slice(from, to);
            const insert = replaceAll(remove, link, signlink);

            content = content.slice(0, from) + insert + content.slice(to);
            location[1] += insert.length - remove.length;
        }

        return content;
    }, markdown);
};

hashDeps.stage = 'after';
