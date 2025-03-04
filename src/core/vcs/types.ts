export interface VcsConnector {
    getUserByLogin(login: string): Promise<Contributor | null>;
    getAuthorByPath(path: RelativePath): Promise<Contributor | null>;
    getContributorsByPath(path: RelativePath, deps: RelativePath[]): Promise<Contributor[]>;
    getModifiedTimeByPath(path: RelativePath): Promise<number | null>;
}

export interface VcsMetadata {
    vcsPath?: NormalizedPath;
    updatedAt?: string;
    author?: Contributor;
    contributors?: Contributor[];
}

export interface Contributor {
    avatar: string;
    email: string;
    login: string;
    name: string;
    url: string;
}
