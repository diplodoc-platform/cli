import {describe, expect, it} from 'vitest';
import {extract} from '@diplodoc/translation';

import {markupStructureIssue} from './markup-structure';

describe('markupStructureIssue', () => {
    it.each([
        '**label** details',
        '*label* details',
        '__label__ details',
        '_label_ details',
        '~~label~~ details',
        '^label^ details',
        '`label` details',
        '[label](https://example.com)',
        '![label](image.png)',
        '# label',
        '- label',
        '1. label',
        '> label',
        'label\n\n---',
        '<b>label</b>',
        '{% note info %}\n\nlabel\n\n{% endnote %}',
        '| label |\n| --- |\n| value |',
        '```js\nlabel\n```',
        'First paragraph.\n\nSecond paragraph.',
    ])('rejects invented structure: %s', (target) => {
        expect(markupStructureIssue('Plain text.', target)).toBeDefined();
    });
    it.each(['foo__bar__baz', '2 * 3 = 6', String.raw`Use \*literal\* text`, 'Цена €__price__€'])(
        'accepts literal text: %s',
        (target) => {
            expect(markupStructureIssue('Plain text.', target)).toBeUndefined();
        },
    );
    it.each([
        '**Label:** value',
        '`code` at start',
        'Use `code`',
        'A **bold** and *italic* word.',
        'A [link](https://example.com) here.',
    ])('preserves extracted structure: %s', (doc) => {
        const {units} = extract(doc, {
            compact: true,
            source: {language: 'en', locale: 'US'},
            target: {language: 'ru', locale: 'RU'},
        });
        for (const unit of units) {
            const source = unit.replace(/^<source[^>]*>|<\/source>$/g, '');
            expect(
                markupStructureIssue(
                    source,
                    source.replace(/Label|value|start|Use|word|here/g, 'перевод'),
                ),
            ).toBeUndefined();
        }
    });
    it('rejects an addition next to existing markup', () => {
        const source = 'A <g ctype="bold" x-begin="**" x-end="**" id="g-1">label</g> here';
        expect(markupStructureIssue(source, source + ' and *extra*')).toBeDefined();
    });

    it('allows translating code examples without changing code markup', () => {
        expect(
            markupStructureIssue('Use `prompt="<значение>"` here.', 'Use `prompt="<value>"` here.'),
        ).toBeUndefined();
    });

    it('allows changing sentence count without introducing a new paragraph', () => {
        expect(
            markupStructureIssue('One sentence.', 'First sentence. Second sentence.'),
        ).toBeUndefined();
    });

    it('rejects a duplicated code span observed in the live YTsaurus corpus', () => {
        const source =
            'При удалении данных в качестве значения `$ttl` берется последнее значение, записанное в эту колонку.';
        expect(
            markupStructureIssue(
                source,
                'When deleting data, the last value written to the `$ttl` column is used as the `$ttl` value.',
            ),
        ).toBeDefined();
        expect(
            markupStructureIssue(
                source,
                'When deleting data, the last value written to this column is used as the `$ttl` value.',
            ),
        ).toBeUndefined();
    });

    it('allows reordering sibling formatting but not changing its nesting', () => {
        expect(
            markupStructureIssue('A **bold** and *italic* word.', '*Italic* and **bold** text.'),
        ).toBeUndefined();
        expect(
            markupStructureIssue('A **bold** and *italic* word.', 'A **bold and *italic*** word.'),
        ).toBeDefined();
    });

    it('handles a link title stored in another translation unit', () => {
        const {units} = extract('[Issue](https://example.com "Заголовок") - описание.', {
            compact: true,
            source: {language: 'ru', locale: 'RU'},
            target: {language: 'en', locale: 'US'},
        });
        for (const unit of units) {
            const source = unit.replace(/^<source[^>]*>|<\/source>$/g, '');
            expect(
                markupStructureIssue(
                    source,
                    source.replace('описание', 'description').replace('Заголовок', 'Title'),
                ),
            ).toBeUndefined();
        }
    });
});

describe('inline extraction boundaries', () => {
    it('allows an unchanged opaque inline to move to the beginning of prose', () => {
        const first =
            '<x ctype="no_translate_inline" equiv-text=":no-translate[Code A]" id="x-1"/>';
        const second =
            '<x ctype="no_translate_inline" equiv-text=":no-translate[Code B]" id="x-2"/>';
        expect(
            markupStructureIssue(
                `Use ${first} or ${second}.`,
                `${first} or ${second} can be used.`,
            ),
        ).toBeUndefined();
    });

    it.each([
        ['A **label** and details.', '**标签**以及详细信息。'],
        [
            'Use `code` and a [link](https://example.com).',
            '[链接](https://example.com)和 `code` 可使用。',
        ],
    ])('allows inline word order without changing structure: %s', (source, target) => {
        expect(markupStructureIssue(source, target)).toBeUndefined();
    });

    it.each([
        ['Use :no-translate[CODE].', ':no-translate[OTHER] is used.'],
        ['Use :no-translate[CODE].', ':no-translate[CODE] and :no-translate[CODE] are used.'],
        ['Plain prose.', ':no-translate[CODE] is used.'],
        ['A **label** and text.', '**标签及*嵌套***文本。'],
        ['A [link](https://example.com).', '[链接](https://other.example.com)。'],
        ['A paragraph.', '# 新标题'],
        ['A paragraph.', '- 新列表项'],
        ['A paragraph.', '第一段。\n\n第二段。'],
        ['A paragraph.', '{{new_variable}} text.'],
    ])('still rejects changed structure or protected content: %s', (source, target) => {
        expect(markupStructureIssue(source, target)).toBeDefined();
    });
});

describe('opaque inline comparison context', () => {
    const opaque = '<x ctype="no_translate_inline" equiv-text=":no-translate[A]" id="x-1"/>';
    it('allows a leading placeholder to move inside prose', () => {
        expect(markupStructureIssue(opaque + ' is used.', 'Use ' + opaque + '.')).toBeUndefined();
    });
    it.each([
        [
            'See [link](https://example.test/:no-translate[A]).',
            'See [link](https://evil.test/:no-translate[A]).',
        ],
        [String.raw`Keep \:no-translate[A].`, 'Keep :no-translate[A].'],
        ['Keep `:no-translate[A]`.', 'Keep :no-translate[A].'],
    ])('does not normalize matching literals in other syntax: %s', (source, target) => {
        expect(
            markupStructureIssue('Use ' + opaque + '. ' + source, 'Use ' + opaque + '. ' + target),
        ).toBeDefined();
    });
    it('preserves opaque nesting inside existing formatting', () => {
        expect(
            markupStructureIssue(
                '<g ctype="bold" x-begin="**" x-end="**" id="g-1">' + opaque + '</g> text.',
                opaque + ' <g ctype="bold" x-begin="**" x-end="**" id="g-1">text</g>.',
            ),
        ).toBeDefined();
    });
});
