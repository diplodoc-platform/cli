export interface SyncData {
    mtimes: Record<NormalizedPath, number>;
    authors: Record<NormalizedPath, Contributor>;
    contributors: Record<NormalizedPath, Contributor[]>;
}

export interface VcsConnector {
    getData(): SyncData;
    setData(data: SyncData): void;
    getUserByLogin(login: string): Promise<Contributor | null>;
    getAuthorByPath(path: RelativePath): Promise<Contributor | null>;
    getContributorsByPath(path: RelativePath, deps: RelativePath[]): Promise<Contributor[]>;
    getModifiedTimeByPath(path: RelativePath): Promise<number | null>;
}

export interface VcsMetadata {
    vcsPath?: NormalizedPath;
    sourcePath?: NormalizedPath;
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
