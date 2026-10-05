import {describe, expect, it} from 'vitest';

import {extract} from '../../../utils/translate';

import {sourceFormattedDocument} from './reuse-formatting';

const side = (text: string) =>
    extract(text, {
        compact: true,
        unitLocalIds: true,
        code: 'no',
        source: {language: 'ru', locale: 'RU'},
        target: {language: 'en', locale: 'US'},
    });
const project = (source: string, target: string) =>
    sourceFormattedDocument(side(source), side(target), {source: 'ru', target: 'en'});

describe('source formatting projection', () => {
    it('strips parsed interior emphasis while retaining literal asterisks in code and escaped text', () => {
        expect(
            project('Текст с `a*b` и \\* литералом.\n', 'Text with **`a*b`** and \\* literal.\n'),
        ).toBe('Text with `a*b` and \\* literal.\n');
    });
    it('preserves source inline emphasis when the target has matching span boundaries', () => {
        expect(
            project(
                'Сначала **важно**, затем остальное.\n',
                'First **important**, then the rest.\n',
            ),
        ).toBe('First **important**, then the rest.\n');
    });
    it('refuses to invent translated boundaries for an interior source style', () => {
        expect(() =>
            project('Сначала **важно**, затем остальное.\n', 'First important, then the rest.\n'),
        ).toThrow(/inline style span/);
    });
    it('keeps whole-unit source styles and nested lists with original spacing', () => {
        expect(
            project(
                '1. **Первый шаг.**\n\n   - Второй шаг.\n',
                '1. First step.\n\n  * **Second step.**\n',
            ),
        ).toBe('1. **First step.**\n\n   - Second step.\n');
    });
    it('does not discard additional translated prose', () => {
        expect(() => project('Один абзац.\n', 'One paragraph.\n\nExtra paragraph.\n')).toThrow();
    });
    it('retains an identifier when dropping target-only code styling confirmed by source prose', () => {
        expect(
            project('Сертификаты bus из директории.\n', 'Certificates from the `bus` directory.\n'),
        ).toBe('Certificates from the bus directory.\n');
    });
    it('refuses changed code identifiers and variables', () => {
        expect(() => project('Текст с `key`.\n', 'Text with `other`.\n')).toThrow();
        expect(() => project('Текст {{product}}.\n', 'Text {{other}}.\n')).toThrow();
    });
    it('refuses unsafe protected example changes', () => {
        expect(() =>
            project('Текст.\n\n```sh\nrm file\n```\n', 'Text.\n\n```sh\nrm other\n```\n'),
        ).toThrow(/Protected examples/);
    });
    it('keeps source link delimiters and approved localized destinations', () => {
        expect(
            project(
                'Текст [ссылка](https://example.com/ru/page) далее.\n',
                'Text [link]( https://example.com/en/page) next.\n',
            ),
        ).toBe('Text [link](https://example.com/en/page) next.\n');
    });
    it('keeps translated link titles without losing prose or duplicate unit occurrences', () => {
        expect(
            project(
                'Текст [ссылка](https://example.com/ru/page "Подсказка") далее.\n',
                'Text [link](https://example.com/en/page "Approved tooltip") next.\n',
            ),
        ).toBe('Text [link](https://example.com/en/page "Approved tooltip") next.\n');
    });
    it.each([
        ['uuid', 'id'],
        ['row_cache_size', 'row_cache'],
        ['config.yaml', 'config'],
    ])('refuses target code %s substring changes to %s', (source, target) => {
        expect(() => project(`Используйте ${source}.\n`, `Use \`${target}\`.\n`)).toThrow();
    });
    it('protects fences with longer closing delimiters', () => {
        expect(() =>
            project('Текст.\n\n```sh\nrm file\n````\n', 'Text.\n\n```sh\nrm other\n````\n'),
        ).toThrow(/Protected examples/);
    });
    it('refuses indented code blocks until their literals can be protected', () => {
        expect(() => project('Текст.\n\n    rm file\n', 'Text.\n\n    rm other\n')).toThrow(
            /Indented code/,
        );
    });
    it('protects fenced code inside blockquotes', () => {
        expect(() =>
            project(
                'Текст.\n\n> ```sh\n> rm file\n> ```\n',
                'Text.\n\n> ```sh\n> rm other\n> ```\n',
            ),
        ).toThrow(/Protected examples/);
    });
    it('preserves YFM blocks, variables and source blank lines', () => {
        expect(
            project(
                '{% note info %}\n\nТекст {{product}}.\n\n{% endnote %}\n',
                '{% note info %}\n\n\nText {{product}}.\n\n{% endnote %}\n',
            ),
        ).toBe('{% note info %}\n\nText {{product}}.\n\n{% endnote %}\n');
    });
});
