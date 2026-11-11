import {describe, expect, it} from 'vitest';

import {AnchorRenderCache} from './RenderCache';

describe('Anchor render reuse', () => {
    it('transfers the original environment only once', () => {
        const cache = new AnchorRenderCache<{nested: {value: number}}>();
        const env = {nested: {value: 1}};
        cache.set('page', ['<p id="page">Text</p>', env]);

        expect(cache.take('page')?.[1]).toBe(env);
        env.nested.value = 2;
        expect(cache.take('page')).toBeUndefined();
    });

    it('evicts old renders by count and UTF-8 bytes and rejects oversized pages', () => {
        const cache = new AnchorRenderCache<{}>(2, 6);
        cache.set('first', ['aa', {}]);
        cache.set('second', ['bb', {}]);
        cache.set('third', ['cc', {}]);
        expect(cache.take('first')).toBeUndefined();

        cache.set('fourth', ['яя', {}]);
        expect(cache.take('second')).toBeUndefined();
        expect(cache.take('third')?.[0]).toBe('cc');
        expect(cache.take('fourth')?.[0]).toBe('яя');

        cache.set('oversized', ['яяяя', {}]);
        expect(cache.size).toBe(0);
    });

    it('invalidates pending renders after a Markdown revision changes', () => {
        const cache = new AnchorRenderCache<{}>();
        cache.reset(1);
        cache.set('page', ['old content', {}]);
        cache.reset(1);
        expect(cache.size).toBe(1);

        cache.reset(2);
        expect(cache.take('page')).toBeUndefined();
    });

    it('compares source, includes, titles, SVG data, options, plugins, logger and project identity', () => {
        const cache = new AnchorRenderCache<{}>();
        const options = {
            files: {'include.md': 'Included'},
            titles: {'page.md': {'#': 'Page'}},
            assets: {'image.svg': '<svg id="original"/>'},
            allowHTML: true,
            plugins: [() => {}],
            log: {},
            entries: ['page.md'],
            entrySet: new Set(['page.md']),
        };
        const signature = cache.signature('Text', options, 'constant');
        const variants = [
            {...options, files: {'include.md': 'Changed'}},
            {...options, titles: {'page.md': {'#': 'Changed'}}},
            {...options, assets: {'image.svg': '<svg id="changed"/>'}},
            {...options, allowHTML: false},
            {...options, plugins: [() => {}]},
            {...options, log: {}},
            {...options, entries: ['page.md']},
            {...options, entrySet: new Set(['page.md'])},
        ];

        for (const variant of variants) {
            expect(cache.signature('Text', variant, 'constant')).not.toBe(signature);
        }
        expect(cache.signature('Changed', options, 'constant')).not.toBe(signature);
        expect(cache.signature('Text', options, 'deterministic')).not.toBe(signature);
        expect(cache.signature('Text', options, 'constant')).toBe(signature);
    });

    it('does not walk project-sized collections when hashing a document', () => {
        const cache = new AnchorRenderCache<{}>();
        const entries = new Proxy([], {
            get() {
                throw new Error('Project entries must not be traversed');
            },
        });

        expect(() =>
            cache.signature('Text', {entries, entrySet: new Set()}, 'constant'),
        ).not.toThrow();
    });
});
