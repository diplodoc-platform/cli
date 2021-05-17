import {Contributors, ContributorsFunction, UserByLoginFunction} from '../models';

export interface ConnectorValidatorProps {
    validateFn: (value: any) => Boolean;
    defaultValue?: any;
    errorMessage?: string;
    warnMessage?: string;
    relatedValidator?: Record<string, ConnectorValidatorProps>;
}

export enum SourceType {
    GITHUB = 'github',
}

export enum GitHubConnectorFields {
    OWNER = 'owner',
    REPO = 'repo',
    TOKEN = 'token',
    ENDPOINT = 'endpoint',
}

export interface VCSConnector {
    getContributorsByPath: ContributorsFunction;
    getUserByLogin: UserByLoginFunction;
}

export interface ContributorDTO {
    login?: string;
    avatar?: string;
}

/* eslint-disable camelcase */
export interface GitHubLogsDTO {
    author_email: string;
    author_name: string;
}

export interface VCSConnectorConfig {
    type: string;
    [SourceType.GITHUB]?: {
        endpoint: string;
        token: string;
        owner: string;
        repo: string;
    };
}

export interface UserDTO {
    avatar_url: string;
    html_url: string;
    email: string;
    login: string;
    name: string;
}

export interface FileContributors {
    contributors: Contributors;
}
