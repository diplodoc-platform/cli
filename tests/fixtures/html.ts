/** Resolves generated page resources against its base and publication URL. */
export function resolvePageResources(html: string, pageUrl: string | URL) {
    const baseHref = html.match(/<base href="([^"]*)"/)?.[1];
    if (baseHref === undefined) {
        throw new Error('Missing <base href> in generated page');
    }

    const base = new URL(baseHref, pageUrl);

    return {
        scripts: [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(
            (match) => new URL(match[1], base),
        ),
        links: [...html.matchAll(/<link[^>]+href="([^"]+)"/g)].map(
            (match) => new URL(match[1], base),
        ),
    };
}
