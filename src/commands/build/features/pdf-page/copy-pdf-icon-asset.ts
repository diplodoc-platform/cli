import type {Run} from '~/commands/build';

import {join} from 'node:path';

import {isMediaLink} from '~/core/utils';

import {getPdfIconAssetPath} from './pdf-icon-path';

export async function copyPdfIconAsset(run: Run) {
    const pdfIconPath = getPdfIconAssetPath(run.config as Hash);
    if (!pdfIconPath) {
        return;
    }

    if (!isMediaLink(pdfIconPath)) {
        return;
    }

    const from = join(run.input, pdfIconPath);
    const to = join(run.output, pdfIconPath);

    if (!run.exists(from)) {
        return;
    }

    try {
        const size = run.fs.statSync(from).size;
        if (typeof size === 'number' && size > run.config.content.maxAssetSize) {
            run.logger.error(
                'YFM013',
                `${pdfIconPath}: YFM013 / File asset limit exceeded: ${size} (limit is ${run.config.content.maxAssetSize})`,
            );
        }

        run.logger.copy(from, to);
        await run.copy(from, to);
    } catch (error) {
        run.logger.warn(`Unable to copy pdf icon asset ${pdfIconPath}.`, error);
    }
}
