import path from 'node:path';
import {YfmToc} from '~/models';
import {getSinglePageUrl, isExternalHref} from '~/utils';
import {safePath} from '~/reCli/utils';
import {filterFiles} from '~/services/utils';

export function transformTocForJs(toc: YfmToc, tocDir: string) {
    const processItems = (items: YfmToc[]) => {
        items.forEach((item, index) => {
            if (!toc.singlePage && !item.id) {
                // eslint-disable-next-line no-param-reassign
                item.id = `${item.name}-${index}-${Math.random()}`;
            }
            if (item.items) {
                processItems(item.items);
            }
        });
    };
    processItems([toc]);

    return baseTransformToc(toc, (rawHref: string) => {
        if (isExternalHref(rawHref)) {
            return rawHref;
        }

        let href = rawHref;

        if (href.endsWith('/')) {
            href += 'index.yaml';
        }

        const fileExtension = path.extname(href);
        const filename = path.basename(href, fileExtension) + '.html';

        return safePath(path.join(tocDir, path.dirname(href), filename));
    });
}

export function transformTocForSinglePage(toc: YfmToc, tocDir: string) {
    return baseTransformToc(toc, (href: string) => {
        if (isExternalHref(href)) {
            return href;
        }

        return getSinglePageUrl(tocDir, href);
    });
}

function baseTransformToc(toc: YfmToc, transformItemHref: (href: string) => string): YfmToc {
    const localToc: YfmToc = JSON.parse(JSON.stringify(toc));

    if (localToc.items) {
        localToc.items = filterFiles(
            localToc.items,
            'items',
            {},
            {
                removeHiddenTocItems: true,
            },
        );
    }

    const queue = [localToc];

    while (queue.length) {
        const item = queue.shift();

        if (!item) {
            continue;
        }

        const {items, href} = item;

        if (items) {
            queue.push(...items);
        }

        if (href) {
            item.href = transformItemHref(href);
        }
    }

    return localToc;
}
