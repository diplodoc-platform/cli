export interface LogConfig {
    vcs: {
        scopes?: string[];
        initialCommit?: string;
    };
    authors?: {
        ignore?: string[];
    };
    contributors?: {
        ignore?: string[];
    };
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
    };
};

export type Args = {
    vcsInitialCommit: string;
    vcsScopes: string[];
};
