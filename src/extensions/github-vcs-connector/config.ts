import {option} from '@diplodoc/cli/lib/config';

const vcsRepo = option({
    flags: '--vcs-repo <value>',
    desc: `Github remote repository name.`,
});

const vcsOwner = option({
    flags: '--vcs-owner <value>',
    desc: `Github remote repository owner.`,
});

const vcsEndpoint = option({
    flags: '--vcs-endpoint <value>',
    desc: `Github server name. Default is github.com`,
});

const vcsBranch = option({
    flags: '--vcs-branch <value>',
    desc: `
        VCS branch which will be used to compute vcs data.

        If not set, then current active branch will be used.
    `,
});

const vcsInitialCommit = option({
    flags: '--vcs-initial-commit <value>',
    desc: `Initial commit from which will be computed vcs data.`,
});

export const options = {
    vcsRepo,
    vcsOwner,
    vcsEndpoint,
    vcsBranch,
    vcsInitialCommit,
};
