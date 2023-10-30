import {
    Contributor,
    Contributors,
    ContributorsByPathFunction,
    ExternalAuthorByPathFunction,
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

export type VCSConnectorDump = {
    authorByGitEmail: Record<string, Contributor | null>;
    authorByPath: Record<string, Contributor | null>;
    contributorsByPath: Record<string, FileContributors>;
    contributorsData: Record<string, Contributor | null>;
    userLoginGithubUserCache: Record<string, Contributor>;
};

export interface VCSConnector {
    init: () => Promise<void>;
    getExternalAuthorByPath: ExternalAuthorByPathFunction;
    addNestedContributorsForPath: NestedContributorsForPathFunction;
    getContributorsByPath: ContributorsByPathFunction;
    getUserByLogin: UserByLoginFunction;
    dump: () => VCSConnectorDump;
    load: (dump: VCSConnectorDump) => void;
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
