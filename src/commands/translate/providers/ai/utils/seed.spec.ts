import {describe, expect, it} from 'vitest';

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

        it('should accept a translation that put words into code as an identifier', () => {
            expect(
                compatibleUnits(
                    unit('Support row cache for following tablet cell peers'),
                    unit(`Поддержка ${code('row_cache')} для ведомых пиров`),
                ),
            ).toBe(true);
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

        it('should accept a link localized to the translation language', () => {
            expect(
                compatibleUnits(
                    unit(`More details ${link('here', 'https://ytsaurus.tech/en/blog/post')}.`),
                    unit(`Подробнее ${link('здесь', 'https://ytsaurus.tech/ru/blog/post')}.`),
                ),
            ).toBe(true);
        });

        it('should reject units whose links lead to different pages', () => {
            expect(
                compatibleUnits(
                    unit(`More details ${link('here', 'https://ytsaurus.tech/en/blog/post')}.`),
                    unit(`Подробнее ${link('здесь', 'https://ytsaurus.tech/ru/blog/other')}.`),
                ),
            ).toBe(false);
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
