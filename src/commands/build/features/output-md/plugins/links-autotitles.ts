import {AssetInfo, EntryGraph} from '~/core/markdown/types';
import {Run} from '../../..';
import {Sheduler, StepContext} from '../utils';

function isAutotitle(asset: AssetInfo) {
    return asset.autotitle === true && asset.type === 'link';
}

export function mergeAutotitles(run: Run, titleList: Map<string, string>) {
    const getTitle = async function (link: string, entry: EntryGraph) {
        if (link.startsWith('#')) {
            link = `${entry.path}${link}`;
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

    return async function (sheduler: Sheduler, entry: EntryGraph): Promise<void> {
        const assets = await run.markdown.assets(entry.path);
        const links = assets.filter(isAutotitle);

        const actor = async function (content: string, {link}: StepContext): Promise<string> {
            const {path, hash, location, title} = link as AssetInfo;
            const url = (path || '') + (hash || '');
            const newTitle = await getTitle(url, entry);
            let result = content;

            if (newTitle) {
                result =
                    result.substring(0, location[0] - title.length) +
                    newTitle +
                    result.substring(location[0]);
            }

            return result;
        };

        for (const link of links) {
            sheduler.add(link.location, actor, {link});
        }
    };
}
