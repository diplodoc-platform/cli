import {describe, expect, it} from 'vitest';
import type {EntryInfo} from '../../commands/build/types';
import {setupRun} from '../../commands/build/__tests__';
import {AlgoliaSearchProvider} from './provider';

const DEFAULT_PROVIDER_CONFIG = {
    enabled: true,
    provider: 'algolia',
    api: '/_search/algolia-api.js',
    appId: 'test-app-id',
    searchKey: 'test-search-key',
    indexPrefix: 'test-index'
} as const;


const prepareExtension = async (config = {}) => {
    const run = setupRun({});

    const provider = new AlgoliaSearchProvider(run, {
        ...DEFAULT_PROVIDER_CONFIG,
        ...config
    });

    return {run, provider};
};

describe('Algolia Search', () => {
    it('should add content to index', async () => {
        const {provider} = await prepareExtension();

        const entryInfo: EntryInfo = {
            title: 'Documentation',
            html: 'Welcome to the documentation',
            headings: [],
            meta: {}
        };

        await provider.add('./docs/index.md' as NormalizedPath, 'en', entryInfo);

        expect(provider.getIndexedCount()).toBe(1);
    });

    it('should skip pages with noIndex', async () => {
        const {provider} = await prepareExtension();

        // First add a normal document to verify indexing works
        const normalEntryInfo: EntryInfo = {
            title: 'Public Page',
            html: 'This page should be indexed',
            headings: [],
            meta: {}
        };

        await provider.add('./docs/public.md' as NormalizedPath, 'en', normalEntryInfo);
        expect(provider.getIndexedCount()).toBe(1);

        // Now try to add a document with noIndex
        const noIndexEntryInfo: EntryInfo = {
            title: 'Private Page',
            html: 'This page should not be indexed',
            headings: [],
            meta: {
                noIndex: true
            }
        };

        await provider.add('./docs/private.md' as NormalizedPath, 'en', noIndexEntryInfo);

        // Verify that the count didn't increase after adding the noIndex document
        expect(provider.getIndexedCount()).toBe(1);
    });
}); 