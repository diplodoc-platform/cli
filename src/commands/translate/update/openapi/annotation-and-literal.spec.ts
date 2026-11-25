import {describe, expect, test} from 'vitest';
import {parseDocument} from 'yaml';

import {markup, textPlanner, textValue, trimTrailing} from './annotations';
import {
    changedRange,
    comparisonText,
    keepsProtections,
    linkDestination,
    literalScalar,
    paragraph,
    preserveTargetProtections,
    protectedSpans,
    readInline,
    readLiteral,
    readParagraphs,
    sameStructure,
} from './literal';

describe('OpenAPI annotations', () => {
    test.each([null, false, 42, '', ' \t\n', 'bad\u0007value', 'bad\rvalue'])(
        'rejects invalid prose value %j',
        (value) => expect(textValue(value)).toBe(false),
    );

    test('keeps horizontal whitespace while normalizing and removing terminal line breaks', () => {
        expect(textValue('First\r\nSecond\tline.')).toBe(true);
        expect(trimTrailing('First\r\nSecond  \r\n\n')).toBe('First\nSecond  ');
        expect(trimTrailing('\n\n')).toBe('');
        expect(trimTrailing('First\nSecond')).toBe('First\nSecond');
    });

    test('uses native code and destinations to identify existing phrasing', () => {
        expect(markup('Read `topic` in the [manual](guide.md).')).toEqual(
            markup('Find `topic` in the [handbook](guide.md).'),
        );
        expect(markup('Read `topic`.')).not.toEqual(markup('Read `section`.'));
        expect(markup('{% include [manual](guide.md) %}')).not.toEqual([]);
        expect(markup('Plain prose.')).toEqual([]);
    });

    test('deduplicates annotations, joins soft wraps and retains nested protected code', () => {
        const plan = textPlanner();
        const raw = '**Read `topic`\nfrom the index.**';
        const translate = plan.prepare(raw);
        const again = plan.prepare(raw);
        expect(plan.fragments).toEqual(['**Read `topic` from the index.**']);
        const result = ['**Find `topic` in the catalogue.**'];
        expect(translate(result)).toBe(result[0]);
        expect(again(result)).toBe(result[0]);
        expect(() => translate([])).toThrow('empty YFM translation');
        expect(() => translate(['**Find `other` in the catalogue.**'])).toThrow(
            'protected YFM markup',
        );
        expect(() => translate(['Find `topic` in the catalogue.'])).toThrow('protected YFM markup');
    });

    test('keeps hard breaks and anchors links across multiple translated sentences', () => {
        const plan = textPlanner();
        const compose = plan.prepare('[Read the guide](guide.md).  \nIt has examples.');
        expect(plan.fragments).toEqual(['[Read the guide](guide.md).  \nIt has examples.']);
        expect(
            compose(['[Browse the manual](guide.md).  \nIt has examples. It has diagrams.']),
        ).toBe('[Browse the manual](guide.md).  \nIt has examples. It has diagrams.');
        expect(() => compose(['[Browse the manual](other.md).  \nIt has examples.'])).toThrow(
            'protected YFM markup',
        );
    });

    test.each(['%%%12%%%', '[guide]: ./guide.md\n\nRead [guide].'])(
        'refuses annotation syntax that cannot be safely extracted: %s',
        (text) => expect(() => textPlanner().prepare(text)).toThrow(/placeholder|reference-link/),
    );

    test('copies an annotation without prose and never adds a fragment', () => {
        const plan = textPlanner();
        const copy = plan.prepare('`topic`');
        expect(plan.fragments).toEqual([]);
        expect(copy([])).toBe('`topic`');
    });
});

describe('literal descriptions', () => {
    test('parses exact literal ranges, CRLF, indentation and chomping', () => {
        const text =
            'description: |2- # keep\r\n  First line.\r\n  Second.\r\n\r\n  End.\r\nnext: true\r\n';
        const node = parseDocument(text).get('description', true);
        const literal = readLiteral(text, node);
        expect(literal.header).toBe('|2- # keep\r\n');
        expect(literal.indent).toBe('  ');
        expect(literal.eol).toBe('\r\n');
        expect(literal.value).toBe('First line.\nSecond.\n\nEnd.');
        expect(literal.paragraphs.map(({start, end}) => text.slice(start, end))).toEqual([
            '  First line.\r\n  Second.',
            '  End.',
        ]);
        expect(literalScalar(node)).toBe(node);
        for (const rejected of [
            'description: text',
            'description: >\n  text',
            'description: &id |\n  text',
        ]) {
            expect(literalScalar(parseDocument(rejected).get('description', true))).toBeUndefined();
        }
        expect(literalScalar({type: 'BLOCK_LITERAL', value: 'plain object'})).toBeUndefined();
    });

    test('rejects a missing description, inconsistent ranges and indentation', () => {
        expect(() => readLiteral('description: absent', undefined)).toThrow(/literal description/);
        const original = 'description: |\n  Text.\n';
        const node = parseDocument(original).get('description', true);
        expect(() => readLiteral(original.replace('|', '>'), node)).toThrow(
            'invalid literal header',
        );
        expect(() => readLiteral(original.replace('Text.', '     '), node)).toThrow(
            'empty literal',
        );
        expect(() => readLiteral(original.replace('Text.', 'Other'), node)).toThrow(
            'does not match YAML',
        );
        expect(() => readParagraphs('  First.\nSecond.', '  ', 10)).toThrow('nonuniform');
    });

    test.each([
        '# Section',
        '- Bullet',
        '1. Item',
        '![Image](image.svg)',
        '[Title](guide.md "title")',
        '<span>Text</span>',
        'A paragraph\u007f',
        'Text with {{ variable }}.',
        'Text with invalid `code.',
        'A paragraph\n---',
        '{% include [guide](guide.md) %}',
    ])('keeps non-prose description syntax opaque: %s', (text) => {
        expect(paragraph(text, 0, text.length).prose).toBe(false);
    });

    test('protects inline code and link destinations, with exact whitespace for code', () => {
        const source = paragraph('Read ` a ` in the [guide](guide.md).', 0, 40);
        const partner = paragraph('Find ` a ` in this [manual](guide.md).', 0, 40);
        expect(source.prose).toBe(true);
        expect(sameStructure(source, partner)).toBe(true);
        expect(sameStructure(source, paragraph('Read `a` in the [guide](guide.md).', 0, 40))).toBe(
            false,
        );
        expect(comparisonText('See :no-translate[`a`]   now.')).toBe('See `a` now.');
        expect(protectedSpans(readInline('See :no-translate[`a`] now.'))).toEqual([
            ':no-translate[`a`]',
        ]);
        expect(keepsProtections(['x', 'x'], ['x'])).toBe(false);
        expect(keepsProtections(['x'], ['x', 'x'])).toBe(true);
        expect(linkDestination(readInline('[Guide](guide.md)')[0])).toEqual({
            raw: 'guide.md',
            url: 'guide.md',
            protectedUrl: false,
        });
        expect(linkDestination(readInline('[Guide](:no-translate[guide.md])')[0])).toEqual({
            raw: ':no-translate[guide.md]',
            url: 'guide.md',
            protectedUrl: true,
        });
    });

    test('reinstates target-only code directives on intact code tokens', () => {
        expect(
            preserveTargetProtections('Find `topic` and `index`.', 'Read :no-translate[`topic`].'),
        ).toBe('Find :no-translate[`topic`] and `index`.');
        expect(preserveTargetProtections('Find `topic`.', 'Read `topic`.')).toBe('Find `topic`.');
    });

    test('identifies inserted and replaced paragraphs with unchanged ends', () => {
        const before = readParagraphs('First.\n\nOld.\n\nLast.\n');
        const after = readParagraphs('First.\n\nNew.\n\nExtra.\n\nLast.');
        expect(changedRange(before, after)).toEqual({first: 1, oldEnd: 2, newEnd: 3});
        expect(changedRange(before, before)).toEqual({first: 3, oldEnd: 3, newEnd: 3});
    });
});
