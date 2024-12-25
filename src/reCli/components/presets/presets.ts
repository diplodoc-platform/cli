import fs from 'node:fs';
import path from 'node:path';
import {type BuildConfig, Preset, Presets, Run} from '~/commands/build';
import {CONCURRENCY} from '~/reCli/constants';
import yaml from 'js-yaml';
import pMap from 'p-map';
import {PresetIndex} from '~/reCli/components/presets/types';
import {YfmToc} from '~/models';
import {isExternalHref} from '~/utils';
import {safePath} from '~/reCli/utils';

export async function getPresetIndex(
    cwd: AbsolutePath,
    options: BuildConfig,
    run: Run,
    prevIndex?: PresetIndex,
) {
    const {varsPreset, ignore} = options;
    const index = prevIndex ?? new Map<string, Preset>();

    const presets = await run.glob('**/presets.yaml', {
        cwd,
        ignore,
    });

    await pMap(
        presets,
        async (presetPath) => {
            if (index.has(presetPath)) return;

            const data = await fs.promises.readFile(path.join(cwd, presetPath), 'utf8');
            const presetPresets = yaml.load(data) as Presets;

            const preset = {
                ...presetPresets.default,
                ...presetPresets[varsPreset],
            };

            index.set(presetPath, preset);
        },
        {concurrency: CONCURRENCY},
    );

    return index;
}

export function getFilePresets(presetIndex: PresetIndex, vars: Preset, filepath: string) {
    const presets = [vars];
    let cursor = path.dirname(filepath);
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const place = path.join(cursor, 'presets.yaml');
        const preset = presetIndex.get(place);
        if (preset) {
            presets.unshift(preset);
        }

        const prevCursor = cursor;
        cursor = path.dirname(cursor);
        if (cursor === prevCursor) {
            break;
        }
    }

    const result = presets.reduce((acc, preset) => {
        return {...acc, ...preset};
    }, {});

    return result;
}

export function getNavigationPaths(tocPath: string, toc: YfmToc) {
    const navigationPaths: string[] = [];

    const place = path.dirname(tocPath);

    function processItems(items: YfmToc[]) {
        items.forEach((item) => {
            if (item.href && !isExternalHref(item.href)) {
                const href = safePath(path.join(place, item.href));

                const navigationPath = normalizeHref(href);
                navigationPaths.push(navigationPath);
            }

            if (!toc.singlePage && item.items) {
                processItems(item.items);
            }
        });
    }
    processItems([toc]);

    return navigationPaths;
}

function normalizeHref(href: string): string {
    const preparedHref = path.normalize(href);

    if (preparedHref.endsWith('.md') || preparedHref.endsWith('.yaml')) {
        return preparedHref;
    }

    if (preparedHref.endsWith('/')) {
        return `${preparedHref}index.yaml`;
    }

    return `${preparedHref}.md`;
}
