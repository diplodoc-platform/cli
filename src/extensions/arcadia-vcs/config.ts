import {option, toArray} from '@diplodoc/cli/lib/config';

const vcsInitialCommit = option({
    flags: '--vcs-initial-commit <value>',
    desc: `
        Initial commit to stop vcs data calculation.
        Processing goes from newest to oldest commits and stops at this commit (inclusive).
        Can be partial commit hash (optional).
    `,
});

const vcsScopes = option({
    flags: '--vcs-scope, --vcs-scopes <value>',
    desc: `
        Additional VCS paths (dirs) which will be indexed for VCS info.
        Useful if docs build root is not equal to VCS root,
        and some extra files from VCS was used in docs project.
    `,
    parser: toArray,
});

export const options = {
    vcsInitialCommit,
    vcsScopes,
};
