import {glob} from '../utils/glob';
import {dirname, join, normalize, resolve} from 'node:path';
import {ArgvService} from '../services';
import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import {groupBy} from 'lodash';
import {isExternalHref} from '../utils';

export const CHANGELOG_LIMIT = 50;
export const LANG_SERVICE_RE =
    /(?<lang>[^/]+)\/(?<service>[^/]+)\/changelogs\/__changes-(?<name>[^.]+)\.json$/;

type FileItem = {
    lang: string;
    service: string;
    name: string;
    filepath: string;
    index?: number;
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

export async function processChangelogs() {
    const {output: outputFolderPath, changelogs} = ArgvService.getConfig();

    if (!changelogs) {
        return;
    }

    const result = await glob('**/**/__changes-*.json', {
        cwd: outputFolderPath,
    });

    const files = result.state.found;

    if (!files.length) {
        return;
    }

    const changeFileItems: FileItem[] = [];

    files.forEach((relPath) => {
        const filepath = join(outputFolderPath, relPath);
        const m = relPath.match(LANG_SERVICE_RE);
        if (!m) {
            return;
        }

        const {lang, service, name} = m.groups as {lang: string; service: string; name: string};
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

    const processed = await Promise.all(
        usedFileItems.map(async (items) => {
            const {lang, service} = items[0];

            const basePath = join(outputFolderPath, lang, service);

            const changelogs: ChangelogItem[] = await Promise.all(
                items.map(async ({filepath}) => readFile(filepath, 'utf8').then(JSON.parse)),
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

            const imgSet = new Set();

            await Promise.all(
                changelogs.map(async ({image}, idx) => {
                    if (!image) {
                        return undefined;
                    }

                    const {filepath} = items[idx];
                    const {src} = image;

                    if (isExternalHref(src)) {
                        return undefined;
                    }

                    const imgPath = resolve(dirname(filepath), src);
                    const normSrc = normalize(`/${src}`);
                    const newImagePath = join(basePath, '_changelogs', normSrc);

                    if (!imgSet.has(newImagePath)) {
                        imgSet.add(newImagePath);

                        await mkdir(dirname(newImagePath), {recursive: true});
                        await copyFile(imgPath, newImagePath);
                    }

                    image.src = join(lang, service, '_changelogs', normSrc);

                    return image;
                }),
            );

            return [service, changelogs];
        }),
    );

    await writeFile(
        join(outputFolderPath, 'changelogs.minified.json'),
        JSON.stringify(Object.fromEntries(processed), null, 4),
    );
}
