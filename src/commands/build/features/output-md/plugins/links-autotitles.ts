import type {AssetInfo} from '~/core/markdown/types';
import type {Run} from '../../..';
import type {StepFunction} from '../utils';

import {dirname, join, relative} from 'node:path';

function isAutotitle(asset: AssetInfo) {
    return asset.type === 'link' && asset.autotitle === true;
}

function rebaseAssets(
    content: string,
    assets: AssetInfo[],
    from: NormalizedPath,
    to: NormalizedPath,
) {
    const base = relative(dirname(to), dirname(from));
    return assets.reduceRight((content, {path, location}) => {
        const link = join(base, path);
        return content.slice(0, location[0]) + link + content.slice(location[1]);
    }, content);
}

export function mergeAutotitles(run: Run, titleList: Map<string, string>, assets: AssetInfo[]) {
    const links = assets.filter(isAutotitle);
    const getTitle = async function (link: string, path: NormalizedPath) {
        if (link.startsWith('#')) {
            link = `${path}${link}`;
        }

        if (titleList.has(link)) {
            return titleList.get(link);
        }

        const [href] = link.split('#') as [NormalizedPath, unknown];
        const titles = await run.markdown.titles(href);

        for (const [key, value] of Object.entries(titles)) {
            const {assets} = await run.markdown.inspect(href, titles[key], {});
            const hash = key === '#' ? href : href + key;

            titleList.set(hash, rebaseAssets(value, assets, href, path));
        }

        return titleList.get(link);
    };

    return async function (scheduler, entry): Promise<void> {
        type StepContext = {link: AssetInfo};

        const actor = async function (content: string, {link}: StepContext): Promise<string> {
            const {path, hash, location, title} = link as AssetInfo;
            const url = (path || '') + (hash || '');
            const newTitle = await getTitle(url, entry);

            if (!newTitle) {
                return content;
            }

            return (
                content.substring(0, location[0] - title.length) +
                newTitle +
                content.substring(location[0])
            );
        };

        for (const link of links) {
            scheduler.add(link.location, actor, {link});
        }
    } as StepFunction;
}
