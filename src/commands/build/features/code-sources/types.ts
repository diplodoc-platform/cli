export class SourceError extends Error {}

/**
 * Kind of a code source.
 *
 * `git` is not a git client — nothing is cloned and no `git` binary is used. It
 * is the `http` type with forge-shaped urls: a ref is resolved to a commit over
 * git's smart HTTP protocol, and files are downloaded individually.
 */
export type SourceType = 'git' | 'http' | 'local';

export type SourceConfig = {
    /** Required: where the content comes from. */
    type: SourceType;
    /** `git` only: `owner/name` of the repository. */
    repo?: string;
    /** `git` only: hosting service. Defaults to `https://github.com`. */
    host?: string;
    /** `http` only: base url the file paths are appended to. */
    url?: string;
    /** `local` only: directory to read from. */
    dir?: string;
    /** `git` only: branch, tag or commit to resolve. */
    ref?: string;
    /** Root inside the source. Directive paths are resolved against it. */
    path?: string;
    /**
     * `git` only: template for downloading a single file, e.g.
     * `{host}/{repo}/plain/{commit}/{path}`.
     *
     * Derived from the host by default. Set it for a service whose url shape is
     * not one of the known ones.
     */
    raw?: string;
    /**
     * Template for the "view source" link.
     *
     * Placeholders: `{host}`, `{repo}`, `{url}`, `{ref}`, `{commit}`, `{path}`
     * (source-relative), `{start}`, `{end}`, `{lines}`.
     */
    link?: string;
};

export type ResolvedSource = {
    name: string;
    type: SourceType;
    /**
     * Absolute directory directive paths are resolved against.
     *
     * For downloaded sources this is inside the download directory: files land
     * there under their source-relative path, so reading stays a plain sandboxed
     * file read.
     */
    root: AbsolutePath;
    /** Root of the source before `path` is applied, and its read scope. */
    base: AbsolutePath;
    /**
     * Source-relative prefix of `root`, i.e. the configured `path`.
     *
     * Directive paths are root-relative while links are source-relative, so the
     * prefix has to be re-applied when building a link.
     */
    prefix: string;
    host: string | null;
    repo: string | null;
    /** `http` base url, or `{host}/{repo}` for a forge. */
    url: string | null;
    ref: string | null;
    /** Resolved commit, filled in before documents are processed. */
    commit: string | null;
    /** Single-file download template. `null` for `http` and `local`. */
    raw: string | null;
    link: string | null;
    /** Content is already on disk, nothing to download. */
    vendored: boolean;
};
