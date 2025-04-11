import {option} from '~/core/config';

export const NAME = 'algolia';

export const DESCRIPTION = `
    Upload index objects to Algolia for search functionality.
`;

const input = option({
    flags: '-i, --input <path>',
    desc: 'Path to built docs with _search directory',
});

const appId = option({
    flags: '--app-id <id>',
    desc: 'Algolia Application ID',
});

const apiKey = option({
    flags: '--api-key <key>',
    desc: 'Algolia Admin API Key',
});

const indexName = option({
    flags: '--index-name <name>',
    desc: 'Base name for Algolia indices',
});

export const options = {
    input,
    appId,
    apiKey,
    indexName,
};
