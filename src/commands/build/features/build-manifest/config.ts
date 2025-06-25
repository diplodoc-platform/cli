import {option} from '~/core/config';
import {bold} from 'chalk';
import dedent from 'ts-dedent';

const buildManifest = option({
    flags: '--build-manifest',
    desc: dedent`
        Output a build manifest file.

        Applicable only to builds with ${bold('md')} output format.
    `,
});

export const options = {
    buildManifest,
};
