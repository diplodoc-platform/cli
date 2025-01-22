export interface VcsConnector {
    getUserByLogin(login: string): Promise<Contributor | null>;
    getUserByPath(path: RelativePath): Promise<Contributor | null>;
    getContributorsByPath(path: RelativePath, deps: RelativePath[]): Promise<Contributors>;
    getModifiedTimeByPath(path: RelativePath): Promise<number | null>;
}

export interface Contributor {
    avatar: string;
    email: string;
    login: string;
    name: string;
    url: string;
}

export interface Contributors {
    [email: string]: Contributor;
}
