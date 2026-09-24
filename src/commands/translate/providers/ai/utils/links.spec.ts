import {describe, expect, it} from 'vitest';

import {localizedUrls, pairLinks, revertedUrls} from './links';

const RU_EN = ['ru', 'en'];

const unit = (text: string) => `<source xml:space="preserve">${text}</source>`;

const link = (text: string, url: string) =>
    `<g ctype="link" equiv-text="[{{text}}](${url})" id="g-1" x-begin="[" x-end="](${url})">${text}</g>`;

describe('translate seed links', () => {
    describe('pairLinks', () => {
        it('should pair links to the same page one to one', () => {
            expect(
                pairLinks(
                    ['https://docs.example.com/docs/ru/a', './b.md'],
                    ['./b.md', 'https://docs.example.com/docs/en/a'],
                    RU_EN,
                    false,
                ),
            ).toEqual([
                ['https://docs.example.com/docs/ru/a', 'https://docs.example.com/docs/en/a'],
                ['./b.md', './b.md'],
            ]);
        });

        it('should pair a page of the other edition of a site only when loose', () => {
            const source = ['https://ru.example.org/wiki/Календарь'];
            const target = ['https://en.example.org/wiki/Calendar'];

            expect(pairLinks(source, target, RU_EN, false)).toBeNull();
            expect(pairLinks(source, target, RU_EN, true)).toEqual([[source[0], target[0]]]);
        });

        it('should leave nothing unpaired', () => {
            expect(pairLinks(['./a.md'], ['./b.md'], RU_EN, true)).toBeNull();
            expect(pairLinks(['./a.md'], ['./a.md', './b.md'], RU_EN, true)).toBeNull();
            expect(pairLinks([], [], RU_EN, false)).toEqual([]);
        });
    });

    describe('localizedUrls', () => {
        it('should map the addresses the translation localized', () => {
            const pairs: [string, string][] = [
                [
                    unit(`См. ${link('статью', 'https://ru.example.org/wiki/Календарь')}.`),
                    unit(`See the ${link('article', 'https://en.example.org/wiki/Calendar')}.`),
                ],
                [unit(`Смотрите ${link('обзор', './overview.md')}.`), unit('See the overview.')],
                [
                    unit(`Смотрите ${link('обзор', './overview.md')}.`),
                    unit(`See the ${link('overview', './overview.md')}.`),
                ],
            ];

            expect([...localizedUrls(pairs, RU_EN)]).toEqual([
                ['https://ru.example.org/wiki/Календарь', 'https://en.example.org/wiki/Calendar'],
            ]);
        });

        it('should leave out an address kept or localized differently elsewhere', () => {
            const url = 'https://docs.example.com/docs/ru/a';
            const pairs: [string, string][] = [
                [unit(link('Один', url)), unit(link('One', 'https://docs.example.com/docs/en/a'))],
                [unit(link('Два', url)), unit(link('Two', url))],
            ];

            expect(localizedUrls(pairs, RU_EN).size).toBe(0);
        });
    });

    describe('revertedUrls', () => {
        it('should find source addresses the output links again', () => {
            const from = 'https://ru.example.org/wiki/Календарь';
            const to = 'https://en.example.org/wiki/Calendar';
            const localized = new Map([[from, to]]);

            expect(
                revertedUrls(
                    [unit(`T:${link('article', from)}`), unit(`Kept ${link('article', to)}`)],
                    localized,
                ),
            ).toEqual([[from, to]]);
            expect(revertedUrls([unit('No links.')], localized)).toEqual([]);
            expect(revertedUrls([unit(link('a', from))], new Map())).toEqual([]);
        });
    });
});
