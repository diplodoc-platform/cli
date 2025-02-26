import type {Run} from '~/commands/build';

import {dirname, join} from 'node:path';
import {groupBy} from 'lodash';
import pmap from 'p-map';

import {isExternalHref} from '~/core/utils';

export const CHANGELOG_LIMIT = 50;
export const LANG_SERVICE_RE =
    /(?<lang>[^/]+)\/(?<service>[^/]+)\/changelogs\/__changes-(?<name>[^.]+)\.json$/;

type FileItem = {
    lang: string;
    service: string;
    name: string;
    filepath: AbsolutePath;
    index: number | undefined;
};

type ChangelogItem = {
    date: string;
    title: string;
    storyId?: string;
    image?: {
        src: string;
        alt?: string;
        ratio?: number;
    };
    description: string;
    [x: string]: unknown;
};

export async function processChangelogs(run: Run) {
    if (!run.config.changelogs) {
        return;
    }

    const files = await run.glob('**/**/__changes-*.json', {
        cwd: run.output,
    });

    if (!files.length) {
        return;
    }

    const changeFileItems: FileItem[] = [];

    files.forEach((relPath) => {
        const filepath = join(run.output, relPath);
        const match = relPath.match(LANG_SERVICE_RE);
        if (!match) {
            return;
        }

        const {lang, service, name} = match.groups as {lang: string; service: string; name: string};
        let index;
        if (/^\d+$/.test(name)) {
            index = Number(name);
        }

        changeFileItems.push({lang, service, filepath, name, index});
    });

    const usedFileItems: FileItem[][] = [];

    const langServiceFileItems = groupBy(
        changeFileItems,
        ({lang, service}) => `${lang}_${service}`,
    );

    Object.values(langServiceFileItems).forEach((fileItems) => {
        const hasIdx = fileItems.every(({index}) => index !== undefined);
        fileItems
            .sort(({name: a, index: ai}, {name: b, index: bi}) => {
                if (hasIdx && ai !== undefined && bi !== undefined) {
                    return bi - ai;
                }
                return b.localeCompare(a);
            })
            .splice(CHANGELOG_LIMIT);

        usedFileItems.push(fileItems);
    });

    const images = new Map<AbsolutePath, AbsolutePath>();

    const processed = await pmap(usedFileItems, async (items) => {
        const {lang, service} = items[0];

        const basePath = join(lang, service);

        const changelogs: ChangelogItem[] = await pmap(items, ({filepath}) =>
            run.read(filepath).then(JSON.parse),
        );

        changelogs.forEach((changelog) => {
            const {source: sourceName} = changelog as {source?: string};
            if (sourceName) {
                // eslint-disable-next-line no-param-reassign
                changelog.link = `/${service}/changelogs/${
                    sourceName === 'index' ? '' : sourceName
                }`;
            }
        });

        await pmap(changelogs, async ({image}, idx) => {
            if (!image || isExternalHref(image.src)) {
                return;
            }

            const {filepath} = items[idx];
            const imgPath = join(dirname(filepath), image.src);
            const newImagePath = join(basePath, '_changelogs', image.src);

            images.set(imgPath, join(run.output, newImagePath));

            image.src = newImagePath;
        });

        return [service, changelogs];
    });

    for (const [from, to] of images.entries()) {
        await run.copy(from, to);
    }

    await run.write(
        join(run.output, 'changelogs.minified.json'),
        JSON.stringify(Object.fromEntries(processed), null, 4),
    );
}
