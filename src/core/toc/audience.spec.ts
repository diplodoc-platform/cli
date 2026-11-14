import type {Toc} from './types';

import {describe, expect, it} from 'vitest';

import {collectPageAudiences} from './audience';

const toc = (value: object) => ({path: 'ru/toc.yaml', ...value}) as Toc;

describe('page audiences', () => {
    it('inherits agent visibility and preserves shared siblings', () => {
        const input = toc({
            href: 'index.md',
            items: [
                {visibility: 'agent', items: [{href: 'agent.md'}, {href: 'nested.md'}]},
                {href: 'human.md'},
            ],
        });
        const audiences = collectPageAudiences([input]);
        expect(Object.fromEntries(audiences)).toEqual({
            'ru/index.md': 'common',
            'ru/agent.md': 'agent',
            'ru/nested.md': 'agent',
            'ru/human.md': 'common',
        });
        expect(input.items?.[0].items?.[0].visibility).toBe('agent');
    });

    it('inherits a TOC root restriction and ignores external links', () => {
        expect(
            Object.fromEntries(
                collectPageAudiences([
                    toc({
                        visibility: 'agent',
                        href: 'index.md',
                        items: [{href: 'https://example.com'}, {href: 'guide.md'}],
                    }),
                ]),
            ),
        ).toEqual({'ru/index.md': 'agent', 'ru/guide.md': 'agent'});
    });

    it('allows repeated references with the same audience', () => {
        expect(
            collectPageAudiences([toc({items: [{href: 'guide.md'}, {href: 'guide.md'}]})]).size,
        ).toBe(1);
    });

    it('rejects conflicting aliases across TOCs and nested sections', () => {
        expect(() =>
            collectPageAudiences([
                toc({items: [{href: 'guide.md'}]}),
                {
                    path: 'ru/nested/toc.yaml',
                    items: [{href: '../guide.md', visibility: 'agent'}],
                } as Toc,
            ]),
        ).toThrow('Conflicting visibility for ru/guide.md');
    });

    it('treats different languages as distinct pages', () => {
        expect(
            collectPageAudiences([
                toc({href: 'index.md'}),
                {path: 'en/toc.yaml', href: 'index.md', visibility: 'agent'} as Toc,
            ]).size,
        ).toBe(2);
    });
});
