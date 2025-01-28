import type {VcsMetadata} from '~/core/vcs';

export type Resources = {
    script?: string[];
    style?: string[];
    /**
     * @example
     *   csp:
     *     - default-src: https://example.com
     *       frame-src: https://example.com
     *     - default-src:
     *         - https://one.com
     *         - https://two.com
     */
    csp?: Hash<string | string[]>[];
};

export type Meta = {
    title?: string;
    description?: string;
    keywords?: string[];
    noIndex?: boolean;
    metadata?: Hash;
    __system?: Hash;
    sourcePath?: string;
    vcsPath?: string;
} & VcsMetadata &
    Resources &
    Record<string, unknown>;
