import type {SearchArgs, SearchConfig, SearchRawConfig} from './index';

import {option, valuable} from '~/core/config';

export const options = {
    search: option({flags: '--search', desc: 'Enable search functionality.'}),
    searchProvider: option({
        flags: '--search-provider <provider>',
        desc: 'Search provider (local, external, or an extension provider).',
    }),
    searchEndpoint: option({
        flags: '--search-endpoint <url>',
        desc: 'External HTTP search endpoint.',
    }),
    searchOptions: option({
        flags: '--search-options <json>',
        desc: 'Public extra query parameters for external search (JSON object).',
        parser: JSON.parse,
    }),
};

export function normalizeSearch(
    raw: SearchRawConfig['search'] | undefined,
    args: Partial<SearchArgs>,
): SearchConfig['search'] {
    const configured = valuable(raw);
    let search: SearchConfig['search'];
    if (typeof raw === 'object' && raw !== null) {
        search = {
            ...raw,
            enabled: raw.enabled !== false,
            provider: raw.provider || '',
            hiddenPolicy: raw.hiddenPolicy === true,
        };
    } else {
        search = {enabled: raw === true, provider: 'local', hiddenPolicy: false};
    }
    if (typeof args.searchProvider === 'string') {
        search.provider = args.searchProvider;
        if (!configured) {
            search.enabled = true;
        }
    }
    if (valuable(args.searchEndpoint)) {
        search.endpoint = args.searchEndpoint;
    }
    if (args.searchOptions !== undefined) {
        search.options = args.searchOptions;
    }
    if (valuable(args.search)) {
        search.enabled = Boolean(args.search);
    }
    search.enabled = search.enabled !== false && Boolean(search.provider);
    search.hiddenPolicy = search.hiddenPolicy === true;
    if (search.enabled && search.provider === 'external') {
        validateExternal(search);
    }
    return search;
}

function validateExternal(search: SearchConfig['search']) {
    if (
        typeof search.endpoint !== 'string' ||
        !search.endpoint.trim() ||
        /[\s\\]/.test(search.endpoint) ||
        search.endpoint.startsWith('//')
    ) {
        throw new Error('search.endpoint must be an HTTP(S) URL or a relative path.');
    }
    let endpoint: URL;
    try {
        endpoint = new URL(search.endpoint, 'https://docs.invalid/');
    } catch {
        throw new Error('search.endpoint must be an HTTP(S) URL or a relative path.');
    }
    if (
        !['http:', 'https:'].includes(endpoint.protocol) ||
        endpoint.username ||
        endpoint.password ||
        endpoint.hash
    ) {
        throw new Error(
            'search.endpoint must be an HTTP(S) URL or a relative path without credentials or fragments.',
        );
    }
    if (
        search.options !== undefined &&
        (search.options === null ||
            typeof search.options !== 'object' ||
            Array.isArray(search.options) ||
            Object.values(search.options).some(
                (value) =>
                    !['string', 'number', 'boolean'].includes(typeof value) ||
                    (typeof value === 'number' && !Number.isFinite(value)),
            ))
    ) {
        throw new Error(
            'search.options must be an object of public string, number, or boolean query parameters.',
        );
    }
}
