import {option} from '~/core/config';

const search = option({
    flags: '--search',
    desc: `
        Enable search functionality.

        From command args only local search can be enabled.
        Use config to configure alternate search strategy.
    `,
});

export const options = {
    search,
};
