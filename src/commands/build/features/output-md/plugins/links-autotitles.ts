import type {AssetInfo} from '~/core/markdown/types';
import type {Run} from '../../..';
import type {StepFunction} from '../utils';

function isAutotitle(asset: AssetInfo) {
    return asset.autotitle === true && asset.type === 'link' && !asset.from;
}

export function mergeAutotitles(run: Run, titleList: Map<string, string>) {
    const getTitle = async function (link: string, path: NormalizedPath) {
        if (link.startsWith('#')) {
            link = `${path}${link}`;
        }
        if (titleList.has(link)) {
            return titleList.get(link);
        }

        const [href] = link.split('#');
        const titles = await run.markdown.titles(href as NormalizedPath);
        for (const key in titles) {
            if (key === '#') {
                titleList.set(href, titles[key]);
            } else {
                titleList.set(href + key, titles[key]);
            }
        }

        return titleList.get(link);
    };

    return async function (scheduler, entry): Promise<void> {
        type StepContext = {link: AssetInfo};

        const assets = await run.markdown.assets(entry);
        const links = assets.filter(isAutotitle);

        const actor = async function (content: string, {link}: StepContext): Promise<string> {
            const {path, hash, location, title} = link as AssetInfo;
            const url = (path || '') + (hash || '');
            const newTitle = await getTitle(url, entry);

            if (!newTitle) {
                return content;
            }

            return content.substring(0, location[0] - title.length) +
                newTitle +
                content.substring(location[0]);
        };

        for (const link of links) {
            scheduler.add(link.location, actor, {link});
        }
    } as StepFunction;
}
