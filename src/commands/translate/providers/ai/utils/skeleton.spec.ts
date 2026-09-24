import {describe, expect, it} from 'vitest';

import {alignTranslationUnits} from './seed';
import {restoreFragments} from './skeleton';

const unit = (text: string) => `<source xml:space="preserve">${text}</source>`;

/** Builds a markdown skeleton and units from lines with `[[unit texts]]`: one placeholder per text. */
function side(lines: string[]) {
    const units: string[] = [];
    const skeleton = lines
        .map((line) =>
            line.replace(/\[\[(.*?)\]\]/g, (_, text: string) => {
                units.push(unit(text));
                return `%%%${units.length - 1}%%%`;
            }),
        )
        .join('\n');
    return {skeleton, units};
}

const fragments = (source: string[], target: string[], languages = {source: 'ru', target: 'en'}) =>
    alignTranslationUnits(side(source), side(target), languages).fragments;

const MENU_RU = ['[[Откройте меню:]]', '', '```', 'Настройки - Отладка', '```'];
const MENU_EN = ['[[Open the menu:]]', '', '```', 'Settings - Debugging', '```'];

describe('translate seed skeleton fragments', () => {
    describe('skeletonFragments', () => {
        it('should keep a code block with localized text', () => {
            expect(fragments(MENU_RU, MENU_EN)).toEqual([
                {
                    kind: 'code',
                    source: '```\nНастройки - Отладка\n```',
                    occurrence: 0,
                    target: '```\nSettings - Debugging\n```',
                },
            ]);
        });

        it('should keep localized text of an en to ru translation', () => {
            expect(
                fragments(
                    ['[[Open the menu:]]', '```', 'Settings', '```'],
                    ['[[Откройте меню:]]', '```', 'Настройки', '```'],
                    {source: 'en', target: 'ru'},
                ),
            ).toEqual([
                {
                    kind: 'code',
                    source: '```\nSettings\n```',
                    occurrence: 0,
                    target: '```\nНастройки\n```',
                },
            ]);
        });

        it('should not keep a code block whose code changed', () => {
            // The command differs, not a text: the translation is outdated.
            expect(
                fragments(
                    ['[[Выполните:]]', '```bash', 'yt list //home', '```'],
                    ['[[Run:]]', '```bash', 'yt ls //home', '```'],
                ),
            ).toEqual([]);
            // Another language or line count is another block.
            expect(
                fragments(
                    ['[[Выполните:]]', '```bash', '# Список', '```'],
                    ['[[Run:]]', '```sh', '# List', '```'],
                ),
            ).toEqual([]);
            expect(
                fragments(
                    ['[[Выполните:]]', '```', 'Список', '```'],
                    ['[[Run:]]', '```', 'List', 'more', '```'],
                ),
            ).toEqual([]);
        });

        it('should not keep code blocks of a same-script pair', () => {
            // Without a script to tell the languages apart a localized
            // line cannot be told from changed code.
            expect(
                fragments(
                    ['[[Run:]]', '```', 'Settings', '```'],
                    ['[[Ausführen:]]', '```', 'Einstellungen', '```'],
                    {source: 'en', target: 'de'},
                ),
            ).toEqual([]);
        });

        it('should pair code blocks after the aligned text block', () => {
            // The translation lost a paragraph with a code block of its own:
            // blocks after the next aligned paragraph still pair.
            const result = fragments(
                [
                    '[[Первый абзац.]]',
                    '```',
                    'Первый код',
                    '```',
                    '[[Второй абзац с 2 числами 3.]]',
                    '```',
                    'Второй код',
                    '```',
                ],
                ['[[Second paragraph with 2 numbers 3.]]', '```', 'Second code', '```'],
            );

            expect(result).toEqual([
                {
                    kind: 'code',
                    source: '```\nВторой код\n```',
                    occurrence: 0,
                    target: '```\nSecond code\n```',
                },
            ]);
        });

        it('should not pair a code block with the block of a merged step', () => {
            // The translation merged two steps: its only code block is the
            // one of the second step.
            expect(
                fragments(
                    [
                        '[[Откройте раздел 2:]]',
                        '```',
                        'Настройки - Профиль',
                        '```',
                        '[[Перейдите к безопасности:]]',
                        '```',
                        'Настройки - Безопасность',
                        '```',
                        '[[Готово 3.]]',
                    ],
                    [
                        '[[Open section 2, then go to security:]]',
                        '```',
                        'Settings - Security',
                        '```',
                        '[[Done 3.]]',
                    ],
                ),
            ).toEqual([]);
        });

        it('should not take a link to another site for a localized one', () => {
            const list = (texts: string[], urls: string[]) => ({
                units: texts.map(unit),
                skeleton: urls.map((url, k) => `* [%%%${k}%%%](${url})`).join('\n'),
            });

            expect(
                alignTranslationUnits(
                    list(
                        ['GitHub', 'Канал'],
                        ['https://code.example/team', 'https://t.example/team_ru'],
                    ),
                    list(
                        ['GitHub', 'Social'],
                        ['https://code.example/team', 'https://social.example/team'],
                    ),
                    {source: 'ru', target: 'en'},
                ),
            ).toMatchObject({fragments: [], pairs: [[unit('GitHub'), unit('GitHub')]]});
        });

        it('should keep heading ids the translation added', () => {
            expect(
                fragments(
                    ['# [[Заголовок]] {#title}', '', '[[Текст.]]'],
                    ['# [[Title]] {#title} {#extra}', '', '[[Text.]]'],
                ),
            ).toEqual([
                {
                    kind: 'line',
                    source: JSON.stringify(['# %%%0%%% {#title}', unit('Заголовок')]),
                    occurrence: 0,
                    target: '# %%%0%%% {#title} {#extra}',
                },
            ]);
            // The same ids on both sides are nothing to keep.
            expect(fragments(['## [[Раздел]] {#a}'], ['## [[Section]] {#a}'])).toEqual([]);
        });

        it('should keep a localized destination of a link the skeleton carries', () => {
            // A list item that is a link as a whole: the unit is the link
            // text, the destination stays in the skeleton.
            const list = (texts: string[], urls: string[]) => ({
                units: texts.map(unit),
                skeleton: urls.map((url, k) => `* [%%%${k}%%%](${url})`).join('\n'),
            });

            expect(
                alignTranslationUnits(
                    list(
                        ['GitHub', 'Канал'],
                        ['https://code.example/o/r', 'https://t.example/o_ru'],
                    ),
                    list(
                        ['GitHub', 'Channel'],
                        ['https://code.example/o/r', 'https://t.example/o'],
                    ),
                    {source: 'ru', target: 'en'},
                ).fragments,
            ).toEqual([
                {
                    kind: 'line',
                    source: JSON.stringify(['* [%%%0%%%](https://t.example/o_ru)', unit('Канал')]),
                    occurrence: 0,
                    target: '* [%%%0%%%](https://t.example/o)',
                },
            ]);
            // Another page is another block: the items do not even pair.
            expect(
                alignTranslationUnits(list(['Обзор'], ['./a.md']), list(['Overview'], ['./b.md']), {
                    source: 'ru',
                    target: 'en',
                }).fragments,
            ).toEqual([]);
        });

        it('should keep nothing for yaml documents', () => {
            const result = alignTranslationUnits(
                {units: [unit('Заголовок')], skeleton: {title: '%%%0%%%'}},
                {units: [unit('Title')], skeleton: {title: '%%%0%%%'}},
                {source: 'ru', target: 'en'},
            );

            expect(result.fragments).toEqual([]);
        });
    });

    describe('restoreFragments', () => {
        const recorded = fragments(
            ['## [[Раздел]]', ...MENU_RU, '```js', '// [[Чтение]]', 'Текст', '```'],
            ['## [[Section]] {#section}', ...MENU_EN, '```js', '// [[Reading]]', 'Text', '```'],
        );

        it('should put the fragments back where the source did not change', () => {
            const {skeleton, units} = side([
                '[[Новый абзац.]]',
                '## [[Раздел]]',
                ...MENU_RU,
                '```js',
                '// [[Чтение]]',
                'Текст',
                '```',
            ]);

            const result = restoreFragments(skeleton, units, recorded);

            expect(result.restored).toBe(3);
            expect(result.dropped).toEqual({code: 0, line: 0});
            expect(result.skeleton.split('\n')).toEqual([
                '%%%0%%%',
                '## %%%1%%% {#section}',
                '%%%2%%%',
                '',
                '```',
                'Settings - Debugging',
                '```',
                '```js',
                // Placeholders take the numbers of the source.
                '// %%%3%%%',
                'Text',
                '```',
            ]);
        });

        it('should drop the fragments the source changed', () => {
            const {skeleton, units} = side([
                '## [[Другой раздел]]',
                '[[Откройте меню:]]',
                '```',
                'Настройки - Другое',
                '```',
                '```js',
                '// [[Чтение]]',
                'Текст',
                '```',
            ]);

            const result = restoreFragments(skeleton, units, recorded);

            expect(result.restored).toBe(1);
            expect(result.dropped).toEqual({code: 1, line: 1});
            expect(result.skeleton).toContain('Настройки - Другое');
            expect(result.skeleton).not.toContain('{#section}');
        });

        it('should restore the localized occurrence of a repeated block in place', () => {
            const repeated = fragments(
                ['[[Раз.]]', '```', 'Текст', '```', '[[Два 2.]]', '```', 'Текст', '```'],
                ['[[One.]]', '```', 'Текст', '```', '[[Two 2.]]', '```', 'Text', '```'],
            );
            const {skeleton, units} = side([
                '[[Раз.]]',
                '```',
                'Текст',
                '```',
                '[[Два 2.]]',
                '```',
                'Текст',
                '```',
            ]);

            expect(repeated).toHaveLength(1);
            expect(restoreFragments(skeleton, units, repeated).skeleton.split('\n')).toEqual([
                '%%%0%%%',
                '```',
                'Текст',
                '```',
                '%%%1%%%',
                '```',
                'Text',
                '```',
            ]);
        });

        it('should localize a copy of a localized code block the source added', () => {
            const recordedMenu = fragments(MENU_RU, MENU_EN);
            const {skeleton, units} = side([...MENU_RU, '', '```', 'Настройки - Отладка', '```']);

            const result = restoreFragments(skeleton, units, recordedMenu);

            expect(result.restored).toBe(2);
            expect(result.dropped).toEqual({code: 0, line: 0});
            expect(result.skeleton).not.toContain('Настройки');
        });

        it('should restore a code block with a literal %%% in it', () => {
            const recordedCode = fragments(
                ['[[Пример:]]', '```sql', 'SELECT \'%%%\' AS "Процент"', '```'],
                ['[[Example:]]', '```sql', 'SELECT \'%%%\' AS "Percent"', '```'],
            );
            const {skeleton, units} = side([
                '[[Пример:]]',
                '```sql',
                'SELECT \'%%%\' AS "Процент"',
                '```',
            ]);

            expect(recordedCode).toHaveLength(1);
            expect(restoreFragments(skeleton, units, recordedCode).skeleton).toContain(
                'SELECT \'%%%\' AS "Percent"',
            );
        });

        it('should leave a skeleton without fragments as is', () => {
            const {skeleton, units} = side(MENU_RU);

            expect(restoreFragments(skeleton, units, [])).toEqual({
                skeleton,
                restored: 0,
                dropped: {code: 0, line: 0},
            });
        });
    });
});
