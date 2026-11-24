import type {Toc} from './types';

import {describe, expect, it} from 'vitest';

import {applyPageAudiences} from './audience';

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
        const audiences = applyPageAudiences([input]);
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
                applyPageAudiences([
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
            applyPageAudiences([toc({items: [{href: 'guide.md'}, {href: 'guide.md'}]})]).size,
        ).toBe(1);
    });

    it('rejects conflicting aliases across TOCs and nested sections', () => {
        expect(() =>
            applyPageAudiences([
                toc({href: 'guide.md'}),
                {
                    path: 'ru/nested/toc.yaml',
                    items: [
                        {visibility: 'agent', items: [{href: 'other.md'}, {href: '../guide.md'}]},
                    ],
                } as Toc,
            ]),
        ).toThrow(
            'Conflicting visibility for ru/guide.md in resolved TOCs: ' +
                'common at ru/toc.yaml and agent at ru/nested/toc.yaml.items[0].items[1].',
        );
    });

    it('treats different languages as distinct pages', () => {
        expect(
            applyPageAudiences([
                toc({href: 'index.md'}),
                {path: 'en/toc.yaml', href: 'index.md', visibility: 'agent'} as Toc,
            ]).size,
        ).toBe(2);
    });
});
