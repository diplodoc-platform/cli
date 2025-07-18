import {option} from '~/core/config';
import {bold} from 'chalk';
import dedent from 'ts-dedent';

const buildManifest = option({
    flags: '--build-manifest',
    desc: dedent`
        Output a build manifest file. Intended replacement for ${bold('--add-map-file')}.
    `,
});

export const options = {
    buildManifest,
};
