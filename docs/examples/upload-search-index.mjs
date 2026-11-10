import {readFile} from 'node:fs/promises';

// This example assumes an HTTP endpoint that accepts the complete JSON snapshot.
// Adapt the request and replacement behavior to your search backend's import API.
const endpoint = process.env.SEARCH_IMPORT_URL;
if (!endpoint) {
    throw new Error('Set SEARCH_IMPORT_URL to your snapshot import endpoint.');
}

const filename = process.argv[2] || './build/_search/documents.json';
const corpus = JSON.parse(await readFile(filename, 'utf8'));
if (corpus.schemaVersion !== 1 || !Array.isArray(corpus.documents)) {
    throw new Error('Expected a search corpus with schemaVersion: 1 and documents array.');
}

const authorization = process.env.SEARCH_IMPORT_AUTHORIZATION;
const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        ...(authorization ? {Authorization: authorization} : {}),
    },
    body: JSON.stringify(corpus),
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
});
if (!response.ok) {
    throw new Error(`Search snapshot upload failed: HTTP ${response.status}.`);
}

process.stdout.write(`Sent ${corpus.documents.length} documents.\n`);
