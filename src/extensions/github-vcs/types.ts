import type {GitConfig} from './git-client';
import type {GithubConfig} from './github-client';

export type Config = GitConfig &
    GithubConfig & {
        mtimes: {enabled: true};
        authors: {enabled: true};
        contributors: {enabled: true};
        vcs: {enabled: boolean};
    };

export type Args = {
    vcsRepo: string;
    vcsOwner: string;
    vcsEndpoint: string;
    vcsBranch: string;
    vcsInitialCommit: string;
};
