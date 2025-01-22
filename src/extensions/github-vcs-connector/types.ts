import type {GithubConfig} from '~/extensions/github-vcs-connector/client';

export type Config = {
    ignoreAuthorPatterns: string[];
    vcs: GithubConfig & {
        initialCommit: string;
    };
};
