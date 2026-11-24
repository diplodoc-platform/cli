type QueryValue = string | number | boolean;

type Config = {
    endpoint: string;
    base: string;
    lang: string;
    options?: Record<string, QueryValue>;
};

type Item = {
    title: string;
    url: string;
    description: string;
    section?: string;
};

type Result = {
    items: Item[];
    total: number;
    tagCounts?: Record<string, number>;
};

function isResult(value: unknown): value is Result {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const {items, total, tagCounts} = value as Result;
    return (
        Array.isArray(items) &&
        items.every(
            (item) =>
                item &&
                typeof item.title === 'string' &&
                typeof item.url === 'string' &&
                typeof item.description === 'string' &&
                (item.section === undefined || typeof item.section === 'string'),
        ) &&
        Number.isSafeInteger(total) &&
        total >= 0 &&
        (tagCounts === undefined ||
            (tagCounts !== null &&
                typeof tagCounts === 'object' &&
                !Array.isArray(tagCounts) &&
                Object.values(tagCounts).every(
                    (count) => Number.isSafeInteger(count) && count >= 0,
                )))
    );
}

export function createExternalSearchApi(config: Config) {
    async function search(
        query: string,
        count: number,
        page: number,
        tags: string[] = [],
    ): Promise<Result> {
        const url = new URL(config.endpoint, config.base.replace(/\/?$/, '/'));
        for (const [key, value] of Object.entries(config.options || {})) {
            url.searchParams.set(key, String(value));
        }
        url.searchParams.set('query', query);
        url.searchParams.set('lang', config.lang);
        url.searchParams.set('count', String(count));
        url.searchParams.set('page', String(page));
        url.searchParams.delete('tags');
        for (const tag of tags) {
            url.searchParams.append('tags', tag);
        }
        const response = await fetch(url.href, {headers: {Accept: 'application/json'}});
        if (!response.ok) {
            throw new Error(`External search request failed: HTTP ${response.status}`);
        }
        const result: unknown = await response.json();
        if (!isResult(result)) {
            throw new Error('Invalid external search response');
        }
        return result;
    }
    return {
        search,
        async suggest(query: string, count: number) {
            const {items} = await search(query, count, 1);
            return items.map(({url, ...item}) => ({...item, type: 'page' as const, link: url}));
        },
    };
}
