export type Redirect = {
    from: RelativePath;
    to: RelativePath;
};

export type Redirects = {
    vcs?: boolean | VcsRedirectsConfig;
    files?: Redirect[];
} & Hash<unknown>;

export type VcsRedirectsConfig = {
    initialCommit: string;
};
