import {option} from '~/config';

const lint = option({
    flags: '--lint',
    desc: 'Toggle file linting.',
});

const lintDisabled = option({
    flags: '--lint-disabled',
    desc: 'Disable linting.',
    hidden: true,
    deprecated: 'Use --no-lint instead',
});

export const options = {
    lint,
    lintDisabled,
};
