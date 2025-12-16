import {option} from '~/core/config';

const vcsPath = option({
    flags: '--vcs-path',
    desc: 'Should attach vcsPath into files and display it in document header',
    default: true,
});

const mtimes = option({
    flags: '--mtimes',
    desc: 'Should attach change time mark into files and display it in document header',
});

const authors = option({
    flags: '--authors',
    desc: 'Should attach author into files and display it in document header',
});

const contributors = option({
    flags: '--contributors',
    desc: 'Should attach contributors into files and display them in document header',
});

const ignoreAuthor = option({
    flags: '--ignore-author <string>, --ignore-contributor <string>',
    desc: `
        Ignore authors and contributors if they contain passed string.

        Example:
            {{PROGRAM}} -i input -o output --authors --ignore-author robot-*
    `,
});

export const options = {
    vcsPath,
    mtimes,
    authors,
    contributors,
    ignoreAuthor,
};
