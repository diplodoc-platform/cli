export interface LogConfig {
    vcs: {
        scopes?: string[];
        initialCommit?: string;
        cache?: ArcadiaVcsCacheConfig;
    };
    authors?: {
        ignore?: string[];
    };
    contributors?: {
        ignore?: string[];
    };
}

export interface ArcadiaVcsCacheConfig {
    source?: string;
    seed?: string;
    output?: string;
    authEnv?: string;
}

export interface ArcadiaVcsCache {
    version: 1;
    revision: string;
    scopes: string[];
    mtimes: Record<string, number>;
    authors: Record<string, {login: string; commit: string}>;
    contributors: Record<string, Array<{login: string; commit: string}>>;
}

export type Config = {
    mtimes: {enabled: true};
    authors: {
        enabled: true;
        ignore?: string[];
    };
    contributors: {
        enabled: true;
        ignore?: string[];
    };
    vcs: {
        enabled: boolean;
        scopes: string[];
        initialCommit?: string;
        cache?: ArcadiaVcsCacheConfig;
    };
};

export type Args = {
    vcsInitialCommit: string;
    vcsScopes: string[];
};
