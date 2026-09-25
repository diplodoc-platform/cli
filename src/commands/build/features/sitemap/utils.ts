const SITEMAP_XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';
const SITEMAP_URLSET_OPEN = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
const SITEMAP_URLSET_CLOSE = '</urlset>';
const SITEMAP_INDENT = '    ';

const XML_ENTITIES: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
};

function escapeXml(value: string): string {
    return value.replace(/[&<>"']/g, (char) => XML_ENTITIES[char]);
}

/**
 * Generates sitemap.xml content for the given page urls.
 *
 * Follows the sitemap protocol (https://www.sitemaps.org/schemas/sitemap/0.9/):
 * every url is emitted as a `<url><loc>` entry. Duplicates are collapsed and
 * entries are sorted to keep the output stable between builds.
 *
 * The urls are expected to be absolute. Keeping this function free of any cli
 * specifics makes it usable outside of static builds (e.g. by the docs viewer).
 *
 * @param urls - Absolute page urls to include in the sitemap
 * @returns Serialized sitemap.xml document
 */
export function generateSitemap(urls: string[]): string {
    const entries = [...new Set(urls)].sort().map((url) => {
        const loc = `${SITEMAP_INDENT.repeat(2)}<loc>${escapeXml(url)}</loc>`;

        return [`${SITEMAP_INDENT}<url>`, loc, `${SITEMAP_INDENT}</url>`].join('\n');
    });

    return [SITEMAP_XML_DECLARATION, SITEMAP_URLSET_OPEN, ...entries, SITEMAP_URLSET_CLOSE].join(
        '\n',
    );
}
