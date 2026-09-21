/**
 * URL shapes of git hosting services.
 *
 * A `git` source is not a git client: nothing is cloned and no `git` binary is
 * involved. The type exists only because reading a file from a forge takes three
 * different urls — one to resolve a ref, one to download the file, one to link a
 * human at it — and those follow a per-host pattern that is tedious to spell out
 * by hand.
 *
 * Templates expand `{host}`, `{repo}`, `{commit}`, `{path}` and, for links,
 * `{lines}`/`{start}`/`{end}`.
 */
export type Forge = {
    /** Single-file download url. */
    raw: string;
    /** Human-facing "view source" url. */
    link: string;
};

const GITHUB: Forge = {
    raw: 'https://raw.githubusercontent.com/{repo}/{commit}/{path}',
    link: '{host}/{repo}/blob/{commit}/{path}#{lines}',
};

/** Enterprise installations serve raw content from their own host. */
const GITHUB_SELF_HOSTED: Forge = {
    raw: '{host}/{repo}/raw/{commit}/{path}',
    link: '{host}/{repo}/blob/{commit}/{path}#{lines}',
};

const GITLAB: Forge = {
    raw: '{host}/{repo}/-/raw/{commit}/{path}',
    link: '{host}/{repo}/-/blob/{commit}/{path}#{lines}',
};

const BITBUCKET: Forge = {
    raw: '{host}/{repo}/raw/{commit}/{path}',
    link: '{host}/{repo}/src/{commit}/{path}#lines-{start}',
};

export const DEFAULT_HOST = 'https://github.com';

/**
 * Picks the url shape for a host.
 *
 * An unrecognised host gets the GitHub shape, which is what most self-hosted
 * services imitate. When that is wrong, `raw` and `link` override it per source —
 * there is no failure mode here that needs a fallback to cloning.
 */
export function forgeOf(host: string): Forge {
    if (/^https?:\/\/(?:www\.)?github\.com$/i.test(host)) {
        return GITHUB;
    }

    if (/gitlab/i.test(host)) {
        return GITLAB;
    }

    if (/bitbucket/i.test(host)) {
        return BITBUCKET;
    }

    return GITHUB_SELF_HOSTED;
}

/** Endpoint every git http server answers ref discovery on. */
export function refsUrl(host: string, repo: string) {
    return `${host}/${repo}/info/refs?service=git-upload-pack`;
}
