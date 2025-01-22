export type Resources = {
    script?: string[];
    style?: string[];
    csp?: Hash<string | string[]>;
};

export type Author = {
    name: string;
    email: string;
};

export type Meta = {
    title?: string;
    description?: string;
    keywords?: string[];
    noIndex?: boolean;
    metadata?: Hash;
    __system?: Hash;
    author?: string | Author;
    contributors?: string[];
    sourcePath?: string;
    vcsPath?: string;
} & Resources &
    Record<string, unknown>;
