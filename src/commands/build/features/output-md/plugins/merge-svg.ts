import type {AssetInfo, ImageOptions} from '~/core/markdown/types';
import type {Run} from '../../..';
import type {StepFunction} from '../utils';

import {createIDGeneratorByStrategy} from '@diplodoc/utils';
import {replaceSvgContent} from '@diplodoc/transform/lib/plugins/images';
import path from 'node:path';

/**
 * Marker prefix for the HTML comment that preserves the original markdown
 * image markup before inlining.
 *
 * When `mergeSvg` replaces a markdown image link (`![title](path.svg)`) with
 * inline `<svg>...</svg>` XML, it also writes the original markup into an
 * HTML comment on the same line:
 *
 * ```
 * <!-- diplodoc:svg ![title](path.svg "alt" =100x200) --><svg ...>...</svg>
 * ```
 *
 * This serves two purposes:
 *
 * 1. **docs-viewer "md companion" mode** (future): the viewer can detect the
 *    marker, expand the comment back to the original markdown link, and strip
 *    the verbose `<svg>` XML — giving LLMs a clean markdown reference instead
 *    of hundreds of lines of SVG markup.
 *
 * 2. **Safety**: the comment and SVG are on a single line so the viewer can
 *    reliably find the pair (comment + immediately following SVG) and replace
 *    it.
 *
 * The comment is safe for docs-viewer's normal rendering: the transform's
 * `filterTokens` (see `@diplodoc/transform/lib/utils`) tracks `commented`
 * state and the images plugin skips images inside HTML comments, so the SVG
 * link in the comment is never fetched from S3.
 *
 * SVG assets are still copied to the output because asset collection
 * (`resolve-assets.ts`) runs in the loader phase — before `mergeSvg` — so
 * adding the comment does not affect asset copying.
 */
const SVG_COMMENT_MARKER = 'diplodoc:svg';

function isDef(asset: AssetInfo) {
    return asset.type === 'def' && asset.path?.endsWith('.svg');
}
function isImage(asset: AssetInfo) {
    return asset.type === 'image' && (asset.path.endsWith('.svg') || asset.subtype === 'reference');
}

export function mergeSvg(run: Run, svgList: Map<string, string>, assets: AssetInfo[]) {
    const defs = assets.filter(isDef);
    const images = assets.filter(isImage);
    const generateID = createIDGeneratorByStrategy(run.config.idGenerator);

    return async function (scheduler, entry): Promise<void> {
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
            if (svgContent.length > run.config.content.maxInlineSvgSize) {
                run.logger.info(
                    `Svg size: ${svgContent.length}; Config size: ${run.config.content.maxInlineSvgSize}; Image: ${imgPath}; Src: ${entry}`,
                );
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

            // Capture the original markdown image markup (including title,
            // sizes, and options) before replacing it with inline SVG.
            const start = location[0] - 2 - title.length;
            const originalMarkup = content.substring(start, end);

            return (
                content.substring(0, start) +
                `<!-- ${SVG_COMMENT_MARKER} ${originalMarkup} -->` +
                replaceSvgContent(svgContent, options, generateID) +
                content.substring(end)
            );
        };

        for (const image of images) {
            scheduler.add(image.location, actor, {image});
        }
    } as StepFunction;
}
