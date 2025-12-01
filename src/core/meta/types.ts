import type {VcsMetadata} from '~/core/vcs';

/**
 * Raw resources format before normalization.
 *
 * CSP values can be strings or arrays, which are normalized to arrays during processing.
 *
 * @example
 * ```typescript
 * {
 *     script: ['/assets/app.js'],
 *     style: ['/assets/styles.css'],
 *     csp: [
 *         {
 *             'default-src': 'https://example.com',  // string
 *             'frame-src': 'https://example.com',
 *         },
 *         {
 *             'default-src': ['https://one.com', 'https://two.com'],  // array
 *         },
 *     ],
 * }
 * ```
 */
export type RawResources = {
    /** Array of script file paths or URLs */
    script?: string[];
    /** Array of stylesheet file paths or URLs */
    style?: string[];
    /**
     * Content Security Policy directives.
     * Values can be strings or arrays (normalized to arrays during processing).
     *
     * @example
     * ```yaml
     * csp:
     *   - default-src: https://example.com
     *     frame-src: https://example.com
     *   - default-src:
     *       - https://one.com
     *       - https://two.com
     * ```
     */
    csp?: Hash<string | string[]>[];
};

/**
 * Normalized page resources (scripts, styles, CSP directives).
 *
 * All CSP values are guaranteed to be arrays after normalization.
 */
export type Resources = {
    /** Array of script file paths or URLs */
    script?: string[];
    /** Array of stylesheet file paths or URLs */
    style?: string[];
    /** Content Security Policy directives (all values are arrays) */
    csp?: Hash<string[]>[];
};

/**
 * Alternate language link for a page.
 *
 * Used for hreflang tags in HTML head for SEO and language selection.
 *
 * @example
 * ```typescript
 * {
 *     href: '/docs/en/page.html',
 *     hreflang: 'en',
 * }
 * ```
 */
export type Alternate = {
    /** URL of the alternate language version */
    href: string;
    /** Language code (e.g., 'en', 'ru', 'fr') */
    hreflang?: string;
};

/**
 * Complete metadata structure for a documentation page.
 *
 * Extends VcsMetadata (author, contributors, etc.) and Resources (scripts, styles, CSP).
 * Includes SEO fields, custom meta tags, alternate links, and system variables.
 *
 * @example
 * ```typescript
 * {
 *     title: 'Page Title',
 *     description: 'Page description for SEO',
 *     keywords: ['docs', 'tutorial'],
 *     noIndex: false,
 *     canonical: 'https://example.com/docs/page',
 *     alternate: [
 *         {href: '/en/page.html', hreflang: 'en'},
 *         {href: '/ru/page.html', hreflang: 'ru'},
 *     ],
 *     script: ['/assets/app.js'],
 *     style: ['/assets/styles.css'],
 *     metadata: {
 *         'og:title': 'Open Graph Title',
 *         'twitter:card': 'summary',
 *     },
 * }
 * ```
 */
export type Meta = {
    /** Page title for HTML head and SEO */
    title?: string;
    /** Page description for meta tag and SEO */
    description?: string;
    /** Keywords array for meta keywords tag */
    keywords?: string[];
    /** If true, adds noindex meta tag to prevent search engine indexing */
    noIndex?: boolean;
    /** Custom meta tags as hash or array of meta items */
    metadata?: Hash;
    /** System/internal variables (only included if config.addSystemMeta is enabled) */
    __system?: Hash;
    /** Source file path */
    sourcePath?: string;
    /** VCS path of the document */
    vcsPath?: string;
    /** Page resources (legacy, use top-level script/style/csp instead) */
    resources?: Resources;
    /** Restricted access rules (array of access rule arrays) */
    'restricted-access'?: string[][];
    /** Canonical URL for the page */
    canonical?: string;
    /** Alternate language links */
    alternate?: Alternate[];
} & VcsMetadata &
    Resources &
    Record<string, unknown>;
