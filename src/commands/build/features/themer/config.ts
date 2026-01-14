import {option} from '~/core/config';

const theme = option({
    flags: '--theme <color>',
    desc: 'Override base brand color (overrides theme.yaml).',
});

export const options = {
    theme,
};


