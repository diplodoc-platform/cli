import {describe, expect, it} from 'vitest';

import {alignUnits} from './align';

const stripLang = (file: string) => file.split(/[\\/]/).slice(1).join('/');

describe('alignUnits', () => {
    it('should pair units positionally per page', () => {
        const result = alignUnits({
            source: new Map([['ru/about.md', ['Привет', 'Мир']]]),
            baseline: new Map([['en/about.md', ['Hello', 'World']]]),
            candidate: new Map([['en/about.md', ['Hi', 'Earth']]]),
            stripLang,
        });

        expect(result.mismatched).toEqual([]);
        expect(result.triples).toEqual([
            {page: 'about.md', index: 0, source: 'Привет', baseline: 'Hello', candidate: 'Hi'},
            {page: 'about.md', index: 1, source: 'Мир', baseline: 'World', candidate: 'Earth'},
        ]);
    });

    it('should exclude pages whose unit counts diverge and name the culprit', () => {
        const result = alignUnits({
            source: new Map([['ru/about.md', ['Привет', 'Мир']]]),
            baseline: new Map([['en/about.md', ['Hello', 'World']]]),
            candidate: new Map([['en/about.md', ['Hello World']]]),
            stripLang,
        });

        expect(result.triples).toEqual([]);
        expect(result.mismatched).toEqual([
            {page: 'about.md', side: 'candidate', detail: '2 source units vs 1 candidate units'},
        ]);
    });

    it('should report a page the candidate did not produce at all', () => {
        const result = alignUnits({
            source: new Map([['ru/about.md', ['Привет']]]),
            baseline: new Map([['en/about.md', ['Hello']]]),
            candidate: new Map(),
            stripLang,
        });

        expect(result.mismatched).toEqual([
            {page: 'about.md', side: 'candidate', detail: '1 source units vs no candidate units'},
        ]);
    });

    it('should keep the comparable pages when another page diverges', () => {
        const result = alignUnits({
            source: new Map([
                ['ru/about.md', ['Привет']],
                ['ru/index.md', ['Заголовок']],
            ]),
            baseline: new Map([
                ['en/about.md', ['Hello']],
                ['en/index.md', ['Title']],
            ]),
            candidate: new Map([
                ['en/about.md', ['Hi', 'Extra']],
                ['en/index.md', ['Heading']],
            ]),
            stripLang,
        });

        expect(result.mismatched).toHaveLength(1);
        expect(result.triples).toEqual([
            {
                page: 'index.md',
                index: 0,
                source: 'Заголовок',
                baseline: 'Title',
                candidate: 'Heading',
            },
        ]);
    });
});
