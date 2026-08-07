import {describe, expect, it} from 'vitest';

import {LocalSearchProvider} from './provider';

describe('LocalSearchProvider config', () => {
    it('exposes an empty tags list in search page config', () => {
        const provider = new LocalSearchProvider({config: {skipHtmlExtension: false}} as never, {
            enabled: true,
            tolerance: 2,
            confidence: 'phrased',
        });

        expect(provider.config('en')).toHaveProperty('tags', []);
    });

    it('exposes tags only in search page config', async () => {
        const provider = new LocalSearchProvider({config: {skipHtmlExtension: false}} as never, {
            enabled: true,
            tolerance: 2,
            confidence: 'phrased',
        });

        await provider.add('page.md', 'en', {
            html: '<p>Page</p>',
            meta: {tags: ['info', '_internal']},
            title: 'Page',
        } as never);

        expect(provider.config('en')).toMatchObject({tags: ['info']});
        expect(provider.config('en', false)).toHaveProperty('tags', []);
    });
});
