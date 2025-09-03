import {option} from '~/core/config';

const watch = option({
    flags: '-w, --watch',
    desc: `
        Enable watch mode.
    `,
});

export const options = {
    watch,
};
