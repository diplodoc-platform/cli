import {Contributors, ContributorsFunction} from '../models';

export enum SourceType {
    GITHUB = 'gitHub',
    BITBUCKET = 'bitbucket',
    ARCANUM = 'arcanum',
}

export interface VCSConnectorOptions {
    isContributorsExist: boolean;
}

export interface VCSConnector {
    getContributorsByPath: ContributorsFunction;
}

export interface RepoVCSConnector {
    getRepoContributors: () => Promise<Contributors>;
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
    type: string;
    github?: {
        endpoint: string;
        token: string;
        owner: string;
        repo: string;
    };
}

export interface UserDTO {
    email: string;
    login: string;
    name: string;
}
