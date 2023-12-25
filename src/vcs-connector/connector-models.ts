import {
    Contributors,
    ContributorsByPathFunction,
    ExternalAuthorByPathFunction,
    GetModifiedTimeByPathFunction,
    NestedContributorsForPathFunction,
    UserByLoginFunction,
} from '../models';

/* eslint-disable camelcase */
export interface ConnectorValidatorProps {
    validateFn: (value: unknown) => Boolean;
    defaultValue?: unknown;
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
    getExternalAuthorByPath: ExternalAuthorByPathFunction;
    addNestedContributorsForPath: NestedContributorsForPathFunction;
    getContributorsByPath: ContributorsByPathFunction;
    getUserByLogin: UserByLoginFunction;
    getModifiedTimeByPath: GetModifiedTimeByPathFunction;
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

export interface FileContributors {
    contributors: Contributors;
    hasIncludes: boolean;
}

export interface GithubCommitDTO {
    commit: {
        author: {
            name: string;
            email: string;
        };
    };
    author: {
        login: string;
        avatar_url: string;
        html_url: string;
    };
}

export interface GithubUserDTO {
    avatar_url: string;
    html_url: string;
    email: string;
    login: string;
    name: string;
}

export interface GitLogsDTO {
    author_email: string;
    author_name: string;
}
