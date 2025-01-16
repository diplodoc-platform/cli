export type Meta = {
    title?: string;
    description?: string;
    keywords?: string[];
    noIndex?: boolean;
    style?: string[];
    script?: string[];
    csp?: Hash;
    metadata?: Hash;
    __system?: Hash;
    author?: string;
    contributors?: string[];
    sourcePath?: string;
    vcsPath?: string;
} & Record<string, unknown>;
