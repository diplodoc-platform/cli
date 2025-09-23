import type {AssetInfo} from '~/core/markdown/types';
import type {Run} from '../../..';
import type {StepFunction} from '../utils';
import type {ImageOptions} from '@diplodoc/transform/lib/typings';

import {replaceSvgContent} from '@diplodoc/transform/lib/plugins/images';
import path from 'node:path';

function isDef(asset: AssetInfo) {
    return asset.type === 'def' && asset.path?.endsWith('.svg');
}
function isImage(asset: AssetInfo) {
    return asset.type === 'image' && (asset.path.endsWith('.svg') || asset.subtype === 'reference');
}

export function mergeSvg(run: Run, svgList: Map<string, string>, assets: AssetInfo[]) {
    const defs = assets.filter(isDef);
    const images = assets.filter(isImage);

    return async function (scheduler, _entry): Promise<void> {
        type StepContext = {image: AssetInfo};

        const actor = async function (content: string, {image}: StepContext): Promise<string> {
            let imgPath = image.path;
            const options = image.options as ImageOptions;
            const {location, title, subtype, code} = image;
            // replace deps
            if (subtype === 'reference') {
                imgPath = defs.filter((def) => def.code === code)[0]?.path;
            }

            if (options.inline === false || !imgPath) {
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

            const [full, _title, oldSizes] = content
                .substring(location[1])
                .match(/ *(?:"(.*?)")?\s?(=\d+x?\d*)?\)?(?:{(.*?)})?/) || [null, null, null, null];
            const end = full ? location[1] + (full.length > 1 ? full.length : 0) : location[1];

            if (oldSizes) {
                [, options.width, options.height] = oldSizes.match(/[=](\d+)x?(\d+)?/) || [
                    null,
                    undefined,
                    undefined,
                ];
            }

            return (
                content.substring(0, location[0] - 2 - title.length) +
                replaceSvgContent(svgContent, options) +
                content.substring(end)
            );
        };

        for (const image of images) {
            scheduler.add(image.location, actor, {image});
        }
    } as StepFunction;
}
