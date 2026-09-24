import {describe, expect, it} from 'vitest';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {SeedStore, TranslationStore} from './cache';
import {alignTranslationUnits, compatibleUnits, doubtfulPair} from './seed';

const RU_EN = {source: 'ru', target: 'en'};

const unit = (text: string) => `<source xml:space="preserve">${text}</source>`;

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

describe('translate seed pairs', () => {
    describe('compatibleUnits', () => {
        const code = (text: string) =>
            `<x ctype="code_open" equiv-text="\`" id="x-1"/>${text}<x ctype="code_close" equiv-text="\`" id="x-2"/>`;

        it('should accept a translation that put a plain token into code', () => {
            expect(
                compatibleUnits(
                    unit('Support for --archives parameter'),
                    unit(`Поддержка параметра ${code('--archives')}`),
                ),
            ).toBe(true);
        });

        describe('identifiers put into code', () => {
            it.each([
                ['Support row cache for peers', 'row_cache'],
                ['Support row-cache for peers', 'row_cache'],
                ['Support Row Cache for peers', 'row_cache'],
                ['Support row cache for peers', 'row-cache'],
                ['Use the wait_for method', 'wait_for'],
            ])('should accept %j with %j in code', (source, identifier) => {
                expect(
                    compatibleUnits(unit(source), unit(`Поддержка ${code(identifier)} для пиров`)),
                ).toBe(true);
            });

            it.each([
                ['Support column cache for peers', 'row_cache'],
                ['Support rowcache for peers', 'row_cache'],
                ['Support row cache for peers', 'row_cache_size'],
            ])('should reject %j with %j in code', (source, identifier) => {
                expect(
                    compatibleUnits(unit(source), unit(`Поддержка ${code(identifier)} для пиров`)),
                ).toBe(false);
            });
        });

        it('should accept a range written with another dash', () => {
            expect(
                compatibleUnits(
                    unit('Spark versions 3.2.2-3.2.4'),
                    unit('версии Spark 3.2.2–3.2.4'),
                ),
            ).toBe(true);
        });

        it('should reject units whose numbers differ', () => {
            expect(compatibleUnits(unit('Release 2.11.1'), unit('Релиз 2.11.0'))).toBe(false);
        });

        it('should reject units whose code spans differ', () => {
            expect(
                compatibleUnits(unit(`Set ${code('foo')}`), unit(`Задайте ${code('bar')}`)),
            ).toBe(false);
        });

        const link = (text: string, url: string) =>
            `<g ctype="link" equiv-text="[{{text}}](${url})" id="g-1" x-begin="[" x-end="](${url})">${text}</g>`;

        describe('review cases', () => {
            const EN_RU_LANGUAGES = ['en', 'ru'];
            const link = (text: string, url: string) =>
                `<g ctype="link" equiv-text="[{{text}}](${url})" id="g-1" x-begin="[" x-end="](${url})">${text}</g>`;

            it.each([
                [
                    'a link to a page in another section',
                    `See ${link('install', '/en/admin/install.md')}.`,
                    `См. ${link('установка', '/ru/user/install.md')}.`,
                ],
                [
                    'a link confirmed by a plain word only',
                    `Read ${link('guide', '/en/guide')}.`,
                    'Читайте guide.',
                ],
                [
                    'a link with another query',
                    `See ${link('results', '/en/search?q=dogs')}.`,
                    `См. ${link('результаты', '/ru/search?q=cats')}.`,
                ],
                [
                    'code in another case',
                    `Call ${code('getUser')}.`,
                    `Вызовите ${code('getuser')}.`,
                ],
                [
                    'code with other separators',
                    `Call ${code('get_user')}.`,
                    `Вызовите ${code('get-user')}.`,
                ],
                [
                    'code swapped with plain text',
                    `Call ${code('getUser')}, not getuser.`,
                    `Вызовите getUser, а не ${code('getuser')}.`,
                ],
            ])('should reject %s', (_, source, target) => {
                expect(compatibleUnits(unit(source), unit(target), EN_RU_LANGUAGES)).toBe(false);
            });
        });

        describe('localized links', () => {
            const EN_RU_LANGUAGES = ['en', 'ru'];
            const pair = (from: string, to: string) =>
                [
                    unit(`More details ${link('here', from)}.`),
                    unit(`Подробнее ${link('здесь', to)}.`),
                ] as const;

            it('should accept a link localized to the translation language', () => {
                const [source, target] = pair(
                    'https://example.com/en/blog/post',
                    'https://example.com/ru/blog/post',
                );

                expect(compatibleUnits(source, target, EN_RU_LANGUAGES)).toBe(true);
            });

            it('should compare links as they are without languages', () => {
                const [source, target] = pair(
                    'https://example.com/en/blog/post',
                    'https://example.com/ru/blog/post',
                );

                expect(compatibleUnits(source, target)).toBe(false);
            });

            it('should accept a link to the same page on another domain', () => {
                const [source, target] = pair(
                    'https://example.com/docs/api/v5/changes/check.html',
                    'https://example.org/docs/api/changes/check.html',
                );

                expect(compatibleUnits(source, target, EN_RU_LANGUAGES)).toBe(true);
            });

            it.each([
                ['https://example.com/en/blog/post', 'https://example.com/ru/blog/other'],
                ['https://x.y/ui/page.html', 'https://x.y/ui/other.html'],
            ])('should reject %j translated as %j', (from, to) => {
                const [source, target] = pair(from, to);

                expect(compatibleUnits(source, target, EN_RU_LANGUAGES)).toBe(false);
            });
        });

        it('should reject a unit whose code marker was hoisted into its own skeleton', () => {
            // The source keeps only the closing marker (the opening one sits
            // in its skeleton); the translation carries both. Composed with
            // the source skeleton the line would get an extra backtick.
            const hoisted =
                'spark.ytsaurus.*<x ctype="code_close" equiv-text="`" id="x-1"/> is the prefix';

            expect(
                compatibleUnits(unit(hoisted), unit(`Префикс ${code('spark.ytsaurus.*')}`)),
            ).toBe(false);
        });
    });

    describe('doubtfulPair', () => {
        const doubtful = doubtfulPair({source: 'en', target: 'ru'});

        it('should accept a translation carrying the same copied words', () => {
            expect(
                doubtful(unit('Run Spark on YTsaurus'), unit('Запустите Spark на YTsaurus')),
            ).toBe(false);
        });

        it('should doubt a translation with a copied word the source lacks', () => {
            expect(
                doubtful(
                    unit('Shut down the master servers'),
                    unit('Снапшот с read-only на мастерах'),
                ),
            ).toBe(true);
        });

        it('should doubt a pair whose lengths differ several times over', () => {
            expect(
                doubtful(
                    unit('Example:'),
                    unit(
                        'Этот подход помогает устранить расхождения между локальным окружением и удалённым.',
                    ),
                ),
            ).toBe(true);
        });

        it('should not judge short units by length', () => {
            expect(doubtful(unit('OK'), unit('Хорошо, готово'))).toBe(false);
        });

        it('should not judge languages sharing a script by copied words', () => {
            expect(
                doubtfulPair({source: 'en', target: 'de'})(unit('Run Spark'), unit('Starte Funke')),
            ).toBe(false);
        });
    });

    describe('alignTranslationUnits', () => {
        it('should flag doubtful pairs and keep them', () => {
            const result = alignTranslationUnits(
                side(['[[Shut down the master servers]]']),
                side(['[[Снапшот с read-only на мастерах]]']),
                {source: 'en', target: 'ru'},
            );

            expect(result.pairs).toEqual([
                [
                    unit('Shut down the master servers'),
                    unit('Снапшот с read-only на мастерах'),
                    true,
                ],
            ]);
            expect(result.doubtful).toBe(1);
            expect(result.unseeded).toBe(0);
        });

        it('should pair units positionally inside aligned blocks', () => {
            const result = alignTranslationUnits(
                side(['# [[Заголовок]]', '', '[[Привет.]] [[Пока.]]']),
                side(['# [[Title]]', '', '[[Hello.]] [[Bye.]]']),
                RU_EN,
            );

            expect(result.pairs).toEqual([
                [unit('Заголовок'), unit('Title')],
                [unit('Привет.'), unit('Hello.')],
                [unit('Пока.'), unit('Bye.')],
            ]);
            expect(result.skipped).toBe(0);
            expect(result.unseeded).toBe(0);
            expect(result.blocks).toEqual({source: 2, target: 2, paired: 2});
        });

        it('should contain a merged sentence to its own paragraph', () => {
            const result = alignTranslationUnits(
                side(['[[Привет.]] [[Пока.]]', '', '- [[Пункт.]]']),
                side(['[[Hello and bye.]]', '', '- [[Item.]]']),
                RU_EN,
            );

            expect(result.pairs).toEqual([[unit('Пункт.'), unit('Item.')]]);
            expect(result.unseeded).toBe(2);
            expect(result.blocks.paired).toBe(2);
        });

        it('should still pair anchored units of a paragraph with a merged sentence', () => {
            const result = alignTranslationUnits(
                side(['[[Версия 2.11.]] [[Привет.]] [[Пока.]]']),
                side(['[[Version 2.11.]] [[Hello and bye.]]']),
                RU_EN,
            );

            expect(result.pairs).toEqual([[unit('Версия 2.11.'), unit('Version 2.11.')]]);
            expect(result.unseeded).toBe(2);
        });

        it('should reject positional pairs whose anchors disagree', () => {
            const result = alignTranslationUnits(
                side(['{% cut "**[[2.11.1]]**" %}', '', '[[Сводка.]]']),
                side(['{% cut "**[[2.11.0]]**" %}', '', '[[Summary.]]']),
                RU_EN,
            );

            expect(result.pairs).toEqual([[unit('Сводка.'), unit('Summary.')]]);
            expect(result.unseeded).toBe(1);
        });

        it('should skip identity pairs that still look untranslated', () => {
            // The target file kept the source text as is - seeding it would
            // freeze the untranslated leftover forever. Skipping lets the
            // next translate run send it to the LLM.
            const result = alignTranslationUnits(
                side(['[[Привет.]] [[yfm build]]']),
                side(['[[Привет.]] [[yfm build]]']),
                RU_EN,
            );

            // Latin-only identity is a legitimately untranslatable unit.
            expect(result.pairs).toEqual([[unit('yfm build'), unit('yfm build')]]);
            expect(result.skipped).toBe(1);
            expect(result.unseeded).toBe(0);
        });

        it('should seed identity pairs when no marker is available', () => {
            const result = alignTranslationUnits(side(['[[Привет.]]']), side(['[[Привет.]]']), {
                source: 'ru',
                target: 'uk',
            });

            expect(result.pairs).toEqual([[unit('Привет.'), unit('Привет.')]]);
            expect(result.skipped).toBe(0);
        });

        it('should report nothing paired when the translation does not align', () => {
            const result = alignTranslationUnits(
                side(['[[Привет.]] [[Пока.]]']),
                side(['[[Hello.]] [[Bye.]] [[Again.]]']),
                RU_EN,
            );

            expect(result.pairs).toEqual([]);
            expect(result.unseeded).toBe(2);
        });

        it('should fall back to positional pairing without skeletons', () => {
            const result = alignTranslationUnits(
                {units: [unit('Привет.'), unit('Пока.')]},
                {units: [unit('Hello.'), unit('Bye.')]},
                RU_EN,
            );

            expect(result.pairs).toEqual([
                [unit('Привет.'), unit('Hello.')],
                [unit('Пока.'), unit('Bye.')],
            ]);
        });
    });
});

describe('translate seed pairs with hoisted markers', () => {
    const code = (text: string) =>
        `<x ctype="code_open" equiv-text="\`" id="x-1"/>${text}<x ctype="code_close" equiv-text="\`" id="x-2"/>`;
    const CODE_OPEN = '<x ctype="code_open" equiv-text="`" id="x-3"/>';
    const RESTORED_CLOSE = '<x ctype="code_close" equiv-text="`" id="x-r1"/>';
    const EN_RU = {source: 'en', target: 'ru'};

    it('should seed a translation whose trailing code marker was hoisted into its own skeleton', () => {
        // The translator put the last name into code; `extract` moved its
        // closing backtick into the skeleton of the translation. The seed
        // puts the marker back so the pair composes under the source skeleton.
        const translation = `Метод ${code('wait_for')} перенесён в ${CODE_OPEN}spyt.connect`;
        const result = alignTranslationUnits(
            side(['- [[Move wait_for method to spyt.connect]]']),
            side([`- [[${translation}]]\``]),
            EN_RU,
        );

        expect(result.pairs).toEqual([
            [unit('Move wait_for method to spyt.connect'), unit(translation + RESTORED_CLOSE)],
        ]);
        expect(result.unseeded).toBe(0);
    });

    it('should keep a translation whose hoisted marker the source hoists too', () => {
        const source = `Move wait_for method to ${CODE_OPEN}spyt.connect`;
        const translation = `Метод wait_for перенесён в ${CODE_OPEN}spyt.connect`;
        const result = alignTranslationUnits(
            side([`- [[${source}]]\``]),
            side([`- [[${translation}]]\``]),
            EN_RU,
        );

        expect(result.pairs).toEqual([[unit(source), unit(translation)]]);
    });
});

describe('translate seed pairs with localized links', () => {
    const link = (text: string, url: string) =>
        `<g ctype="link" equiv-text="[{{text}}](${url})" id="g-1" x-begin="[" x-end="](${url})">${text}</g>`;

    it('should seed a translation keeping its own localized link', () => {
        const source = `${link('Documentation', 'https://example.com/docs/en/gpu')}.`;
        const translation = `${link('Документация', 'https://example.com/docs/ru/gpu')}.`;
        const result = alignTranslationUnits(
            side([`- [[Added GPU checks.]] [[${source}]]`]),
            side([`- [[Добавлены проверки GPU.]] [[${translation}]]`]),
            {source: 'en', target: 'ru'},
        );

        expect(result.pairs).toEqual([
            [unit('Added GPU checks.'), unit('Добавлены проверки GPU.')],
            [unit(source), unit(translation)],
        ]);
    });

    // The cases of the review of the precise link and code comparison, run
    // through the whole alignment: the neutral sentence is seeded, the
    // sentence whose link or code differs is left for the model.
    describe('pairs a precise comparison rejects', () => {
        const code = (text: string) =>
            `<x ctype="code_open" equiv-text="\`" id="x-1"/>${text}<x ctype="code_close" equiv-text="\`" id="x-2"/>`;
        const align = (source: string, translation: string) =>
            alignTranslationUnits(
                side([`- [[Added checks.]] [[${source}]]`]),
                side([`- [[Добавлены проверки.]] [[${translation}]]`]),
                {source: 'en', target: 'ru'},
            );

        it.each([
            [
                'a link to a page in another section',
                `See ${link('install', '/en/admin/install.md')}.`,
                `См. ${link('установка', '/ru/user/install.md')}.`,
            ],
            [
                'a link confirmed by a plain word only',
                `Read ${link('guide', '/en/guide')}.`,
                'Читайте guide.',
            ],
            [
                'a link with another query',
                `See ${link('results', '/en/search?q=dogs')}.`,
                `См. ${link('результаты', '/ru/search?q=cats')}.`,
            ],
            ['code in another case', `Call ${code('getUser')}.`, `Вызовите ${code('getuser')}.`],
            [
                'code with other separators',
                `Call ${code('get_user')}.`,
                `Вызовите ${code('get-user')}.`,
            ],
            [
                'code swapped with plain text',
                `Call ${code('getUser')}, not getuser.`,
                `Вызовите getUser, а не ${code('getuser')}.`,
            ],
            [
                'a link to a page under another section of the same site',
                `See ${link('install', '/en/docs/install.md')}.`,
                `См. ${link('установка', '/ru/docs/admin/install.md')}.`,
            ],
        ])('should not seed %s', (_, source, translation) => {
            const result = align(source, translation);

            expect(result.pairs).toEqual([[unit('Added checks.'), unit('Добавлены проверки.')]]);
            expect(result.unseeded).toBe(1);
        });

        it.each([
            [
                'a link to the same page on another domain and path',
                `See ${link('check', 'https://example.com/docs/api/v5/changes/check.html')}.`,
                `См. ${link('check', 'https://example.org/docs/api/changes/check.html')}.`,
            ],
            [
                'a link with a variable for a part of the path',
                `See ${link('example', 'https://example.com/repo/blob/main/src/sample/main.cpp')}.`,
                `См. ${link('пример', '{{source-root}}/src/sample/main.cpp')}.`,
            ],
            ['words put into code', 'Support row cache.', `Поддержка ${code('row_cache')}.`],
        ])('should seed %s', (_, source, translation) => {
            const result = align(source, translation);

            // A Latin identifier the source writes as words makes the pair
            // doubtful: seeded for its file, kept out of the dictionary.
            expect(result.pairs.map(([text, seed]) => [text, seed])).toEqual([
                [unit('Added checks.'), unit('Добавлены проверки.')],
                [unit(source), unit(translation)],
            ]);
            expect(result.unseeded).toBe(0);
        });
    });

    describe('links under another section', () => {
        const align = (source: string, translation: string) =>
            alignTranslationUnits(side([`- [[${source}]]`]), side([`- [[${translation}]]`]), {
                source: 'en',
                target: 'ru',
            });

        // Another site may lay its pages out differently: the pair is kept
        // for its file, out of the shared dictionary.
        it('should keep a link to another site under another section for its file only', () => {
            const source = `See ${link('check', 'https://example.com/docs/api/v5/changes/check.html')}.`;
            const translation = `См. ${link('check', 'https://example.org/docs/api/changes/check.html')}.`;
            const result = align(source, translation);

            expect(result.pairs).toEqual([[unit(source), unit(translation), true]]);
            expect(result.doubtful).toBe(1);
        });

        // On the same site another section is another page: the source has
        // just fixed its link, and the translation must not keep the old one,
        // neither from the dictionary nor from the memory of its file.
        it.each([
            ['/en/docs/install.md', '/ru/docs/admin/install.md'],
            [
                'https://example.com/en/docs/install.md',
                'https://example.com/ru/docs/admin/install.md',
            ],
        ])('should not reuse a translation keeping %j as %j', (fixed, stale) => {
            const source = `See ${link('install', fixed)}.`;
            const translation = `См. ${link('установка', stale)}.`;
            const result = align(source, translation);
            const seeds = new SeedStore(join(tmpdir(), 'seed-6830-none.json'));
            seeds.record('file.md', result.pairs);
            const store = new TranslationStore(join(tmpdir(), 'cache-6830-none.json'), 'x', seeds);

            expect(result.pairs).toEqual([]);
            expect(store.resolve('file.md', [unit(source)])).toEqual([undefined]);
        });

        it('should not doubt a link to the same page on another domain', () => {
            const source = `See ${link('check', 'https://example.com/docs/api/changes/check.html')}.`;
            const translation = `См. ${link('check', 'https://example.org/docs/api/changes/check.html')}.`;

            expect(align(source, translation).doubtful).toBe(0);
        });
    });
});
