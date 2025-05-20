import type {LoaderContext} from '~/core/markdown/loader';
import type {ChangelogItem} from '.';

import {bold} from 'chalk';

import transform from '@diplodoc/transform';
import imsize from '@diplodoc/transform/lib/plugins/imsize';
import changelog from '@diplodoc/transform/lib/plugins/changelog';

const BLOCK_START = '{% changelog %}';
const BLOCK_END = '{% endchangelog %}';

function parseChangelogs(content: string, path?: string) {
    const {
        result: {changelogs},
    } = transform(content, {
        plugins: [changelog, imsize],
        extractChangelogs: true,
        path,
    });

    return changelogs || [];
}

export const collect = (changelogs: ChangelogItem[]) =>
    function (this: LoaderContext, content: string) {
        let result = content;
        let lastPos = 0;
        const rawChangelogs = [];

        changelogs.length = 0;

        // eslint-disable-next-line no-constant-condition
        while (true) {
            const startPos = result.indexOf(BLOCK_START, lastPos);
            lastPos = startPos;
            if (startPos === -1) {
                break;
            }

            const endBlockPos = result.indexOf(BLOCK_END, startPos + BLOCK_START.length);
            if (endBlockPos === -1) {
                this.logger.error(`Changelog block must be closed in ${bold(this.path)}`);
                break;
            }
            let endPos = endBlockPos + BLOCK_END.length;
            if (result[endPos + 1] === '\n') {
                endPos += 1;
            }

            const changelog = result.slice(startPos, endPos);

            rawChangelogs.push(changelog);

            result = result.slice(0, startPos) + result.slice(endPos);
        }

        if (rawChangelogs.length) {
            const parsedChangelogs = parseChangelogs(rawChangelogs.join('\n\n'), this.path);
            if (parsedChangelogs.length !== rawChangelogs.length) {
                this.logger.error(`Parsed changelogs less than expected${bold(this.path)}`);
            }
            changelogs.push(...parsedChangelogs);
        }

        return result;
    };
