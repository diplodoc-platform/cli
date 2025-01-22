import {option} from '~/core/config';

const contributors = option({
    flags: '--contributors',
    desc: 'Should attach contributors into files',
});

const ignoreAuthorPatterns = option({
    flags: '--ignore-author-patterns <string>',
    desc: 'Ignore authors if they contain passed string',
});

export const options = {
    contributors,
    ignoreAuthorPatterns,
};
