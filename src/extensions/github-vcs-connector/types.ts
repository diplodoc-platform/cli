import type {GitConfig} from './git-client';
import type {GithubConfig} from './github-client';

export type Config = GitConfig &
    GithubConfig & {
        mtimes: {enabled: true};
        authors: {enabled: true};
        contributors: {enabled: true};
    };
