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
