import {option} from '~/config';

const lintDisabled = option({
    flags: '--lint-disabled',
    desc: 'Disable linting.',
});

export const options = {
    lintDisabled,
};
