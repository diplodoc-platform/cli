import {resolve} from 'node:path';

import {option} from '~/core/config';

const yaMake = option({
    flags: '--ya-make <path>',
    desc: `
        Path to Arcadia root. Enables ya.make support.

        Resolves DOCS_DIR and DOCS_COPY_FILES macros from ya.make
        in the input directory and assembles all referenced files
        before building.
    `,
    parser: (value: string) => resolve(process.cwd(), value),
});

export const options = {yaMake};
