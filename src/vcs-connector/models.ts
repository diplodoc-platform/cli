import {ContributorsFunction} from '../models';

export enum SourceType {
    GITHUB = 'gitHub',
}

export interface VCSConnector {
    getContributorsByPath: ContributorsFunction;
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

export interface GithubLogsDTO {
    author_email: string;
    author_name: string;
}

export interface VCSConnectorConfig {
    type: string;
    gitHub: {
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
