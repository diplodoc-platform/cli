import {LogFunction} from '../models';

export enum SourceType {
    github = 'github',
    bitbucket = 'bitbucket',
    arcanum = 'arcanum',
}

export interface Client {
    getLogsByPath: LogFunction;
    repoClient: GithubClient;
}

export interface GithubClient {
    getRepoContributors: () => Promise<ContributorDTO[]>;
}

export interface ContributorDTO {
    login?: string;
    avatar?: string;
}

/* eslint-disable camelcase */
export interface GithubContributorDTO {
    login?: string;
    avatar_url?: string;
}

/* eslint-disable camelcase */
export interface GithubLogsDTO {
    author_email: string;
    author_name: string;
}

export interface YfmConfig {
    endpoint: string;
    type: string;
    token?: string;
    owner?: string;
    repo?: string;
}
