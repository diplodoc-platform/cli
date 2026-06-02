import {bold} from 'chalk';
import dedent from 'ts-dedent';

import {option} from '~/core/config';

const buildContent = option({
    flags: '--build-content',
    desc: dedent`
        Output a build content manifest file (${bold('yfm-build-content.json')}) with
        per-file sha256 hashes and page→asset dependencies. Used by downstream tools
        to compute the set of pages changed between any two build revisions
        (search reindexing, change notifications).
    `,
});

export const options = {
    buildContent,
};
