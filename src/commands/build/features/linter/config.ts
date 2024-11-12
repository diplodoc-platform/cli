import {bold} from 'chalk';
import {option} from '~/config';

const lint = option({
    flags: '--lint',
    desc: `
        Toggle file linting.

        Enabled by default. Use ${bold('--no-lint')} to disable.
    `,
});

export const options = {
    lint,
};
