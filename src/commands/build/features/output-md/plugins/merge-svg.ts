import type {AssetInfo} from '~/core/markdown/types';
import type {Run} from '../../..';
import type {StepFunction} from '../utils';

import path from 'node:path';
import {optimize} from 'svgo';

type ImageOptions = {
    width: string | undefined;
    height: string | undefined;
};

function isDef(asset: AssetInfo) {
    return asset.type === 'def' && asset.path?.endsWith('.svg');
}
function isImage(asset: AssetInfo) {
    return asset.type === 'image' && (asset.path.endsWith('.svg') || asset.subtype === 'reference');
}

function processSvg(content: string, options: ImageOptions) {
    // monoline
    content = content.replace(/\n/g, '');

    // width, height
    let svgRoot = content.replace(/<svg([^>]*)>.*/g, '$1');
    const [, width, height] = svgRoot.match(/(?:width="(.*?)").*?(?:height="(.*?)")/) || [
        null,
        null,
        null,
    ];
    if (!width && options.width) {
        svgRoot = `${svgRoot} width="${options.width}"`;
    }
    if (!height && options.height) {
        svgRoot = `${svgRoot} height="${options.height}"`;
    }
    if (!width && !height && (options.width || options.height)) {
        content = content.replace(/<svg([^>]*)>/, `<svg${svgRoot}>`);
    }

    // randomize ids
    content = optimize(content, {
        plugins: [
            {
                name: 'prefixIds',
                params: {
                    prefix: 'rnd-' + Math.floor(Math.random() * 1e9).toString(16),
                    prefixClassNames: false,
                },
            },
        ],
    }).data;

    return content;
}

export function mergeSvg(run: Run, svgList: Map<string, string>, assets: AssetInfo[]) {
    const defs = assets.filter(isDef);
    const images = assets.filter(isImage);

    return async function (scheduler, _entry): Promise<void> {
        type StepContext = {image: AssetInfo};

        const actor = async function (content: string, {image}: StepContext): Promise<string> {
            let imgPath = image.path;
            const {location, title, subtype, code} = image;
            // replace deps
            if (subtype === 'reference') {
                imgPath = defs.filter((def) => def.code === code)[0]?.path;
            }

            if (!imgPath) {
                return content;
            }

            let svgContent;
            const imgAbsPath = await run.realpath(path.join(run.input, imgPath));
            if (svgList.has(imgAbsPath)) {
                svgContent = svgList.get(imgAbsPath);
            } else {
                svgContent = await run.read(imgAbsPath);
                svgList.set(imgAbsPath, svgContent);
            }

            if (!svgContent) {
                return content;
            }
            const options: ImageOptions = {
                width: undefined,
                height: undefined,
            };

            const [full, _title, oldSizes, sizes] = content
                .substring(location[1])
                .match(/ *(?:"(.*?)")?\s?(=\d+x?\d*)?\)?(?:{(.*?)})?/) || [null, null, null, null];
            const end = full ? location[1] + (full.length > 1 ? full.length : 0) : location[1];
            if (sizes) {
                options.width = sizes.match(/width=(\d+)/)?.[1];
                options.height = sizes.match(/height=(\d+)/)?.[1];
            } else if (oldSizes) {
                [, options.width, options.height] = oldSizes.match(/[=](\d+)x?(\d+)?/) || [
                    null,
                    undefined,
                    undefined,
                ];
            }

            return (
                content.substring(0, location[0] - 2 - title.length) +
                processSvg(svgContent, options) +
                content.substring(end)
            );
        };

        for (const image of images) {
            scheduler.add(image.location, actor, {image});
        }
    } as StepFunction;
}
