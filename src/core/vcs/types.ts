import type {Resources} from '~/core/meta';

export interface SyncData {
    mtimes: Record<NormalizedPath, number>;
    authors: Record<NormalizedPath, Contributor>;
    contributors: Record<NormalizedPath, Contributor[]>;
}

export interface VcsConnector {
    getData(): SyncData;
    setData(data: SyncData): void;
    getBase(): Promise<RelativePath>;
    getUserByLogin(login: string): Promise<Contributor | null>;
    getAuthorByPath(path: RelativePath): Promise<Contributor | null>;
    getContributorsByPath(path: RelativePath, deps: RelativePath[]): Promise<Contributor[]>;
    getModifiedTimeByPath(path: RelativePath): Promise<number | null>;
    getResourcesByPath?(path: RelativePath, meta: VcsMetadata): Promise<Resources>;
}

export interface VcsMetadata extends Partial<Resources> {
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
