import {describe, expect, it} from 'vitest';

import {
    compareMarkup,
    extractLinkTargets,
    markupSignature,
    normalizeLiquidTag,
    visibleText,
} from './markup';

describe('translate eval markup checks', () => {
    describe('normalizeLiquidTag', () => {
        it('should keep the note type and drop cut titles', () => {
            expect(normalizeLiquidTag('note info')).toBe('note:info');
            expect(normalizeLiquidTag('cut "Заголовок"')).toBe('cut');
            expect(normalizeLiquidTag('endnote')).toBe('endnote');
            expect(normalizeLiquidTag('endcut')).toBe('endcut');
        });

        it('should keep include paths and drop labels', () => {
            expect(normalizeLiquidTag('include [метка](../_includes/x.md)')).toBe(
                'include:../_includes/x.md',
            );
            expect(normalizeLiquidTag('include notitle [l](./y.md#anchor)')).toBe(
                'include:./y.md#anchor',
            );
        });

        it('should keep condition expressions', () => {
            expect(normalizeLiquidTag('if var == "x"')).toBe('if:var == "x"');
            expect(normalizeLiquidTag('endif')).toBe('endif');
        });

        it('should normalize tabs markers', () => {
            expect(normalizeLiquidTag('list tabs')).toBe('tabs');
            expect(normalizeLiquidTag('endlist')).toBe('endlist');
        });
    });

    describe('markupSignature', () => {
        it('should collect links, headings, variables and tables', () => {
            const page = [
                '# Заголовок {#anchor}',
                '',
                'Смотрите [ссылку](../a.md) и {{version}}.',
                '',
                '| a | b |',
                '| - | - |',
                '| 1 | 2 |',
            ].join('\n');

            const signature = markupSignature(page);

            expect(signature.links).toEqual(['../a.md']);
            expect(signature.headings).toEqual(['1:#anchor']);
            expect(signature.variables).toEqual(['{{version}}']);
            expect(signature.tables.pipeRows).toEqual([3, 3, 3]);
        });

        it('should not treat not_var constructs as variables', () => {
            expect(markupSignature('Текст not_var{{user}} тут.').variables).toEqual([]);
            expect(markupSignature('Текст {{user}} тут.').variables).toEqual(['{{user}}']);
        });

        it('should ignore markup inside fences', () => {
            const page = ['```', '[link](a.md) {% note info %} {{var}}', '```'].join('\n');

            const signature = markupSignature(page);

            expect(signature.links).toEqual([]);
            expect(signature.liquid).toEqual([]);
            expect(signature.variables).toEqual([]);
        });
    });

    describe('extractLinkTargets', () => {
        it('should unwrap angle-bracket destinations', () => {
            expect(extractLinkTargets('See [x](<https://a.com/b_(c)>).')).toEqual([
                'https://a.com/b_(c)',
            ]);
        });

        it('should handle one level of nested parentheses', () => {
            expect(extractLinkTargets('[x](https://a.com/b_(c)) and [y](./d.md)')).toEqual([
                'https://a.com/b_(c)',
                './d.md',
            ]);
        });

        it('should drop link titles', () => {
            expect(extractLinkTargets('[x](./a.md "подсказка")')).toEqual(['./a.md']);
        });

        it('should ignore unterminated destinations', () => {
            expect(extractLinkTargets('broken [x](./a.md\nnext line)')).toEqual([]);
        });
    });

    describe('table and fence signatures', () => {
        it('should count grid table markers', () => {
            const page = ['#|', '|| a | b ||', '|| 1 | 2 ||', '|#'].join('\n');

            expect(markupSignature(page).tables.gridMarkers).toBe(6);
        });

        it('should report table layout changes', () => {
            const source = '| a |\n| - |\n| 1 |';
            const violations = compareMarkup(source, '| a |\n| - |');

            expect(violations).toEqual([
                {type: 'tables', detail: expect.stringContaining('table row pipes')},
            ]);
        });

        it('should report a changed column count', () => {
            const source = '| a | b |\n| - | - |\n| 1 | 2 |';
            const merged = '| a | b |\n| - | - |\n| 1 2 |';

            expect(compareMarkup(source, merged)).toEqual([
                {type: 'tables', detail: expect.stringContaining('#3')},
            ]);
        });

        it('should report a changed fence count and info', () => {
            const source = '```bash\necho 1\n```';

            expect(compareMarkup(source, 'no fences at all')).toEqual([
                {type: 'fence-count', detail: expect.stringContaining('1 in source')},
            ]);
            expect(compareMarkup(source, '```sh\necho 1\n```')).toEqual([
                {type: 'fence-info', detail: expect.stringContaining('bash')},
            ]);
        });
    });

    describe('visibleText', () => {
        it('should keep link text but drop destinations', () => {
            expect(visibleText('See the [documentation](./links.md).')).toBe(
                'See the [documentation].',
            );
        });

        it('should drop fences, inline code and liquid directives', () => {
            const page = [
                'Читайте про `код` и {% include [метка](../x.md) %} тут.',
                '```',
                'fenced',
                '```',
            ].join('\n');

            const visible = visibleText(page);

            expect(visible).not.toContain('код');
            expect(visible).not.toContain('x.md');
            expect(visible).not.toContain('fenced');
            expect(visible).toContain('Читайте про');
        });
    });

    describe('compareMarkup', () => {
        const source = [
            '# Заметки {#notes}',
            '',
            '{% note info %}',
            '',
            'Примечание со [ссылкой](../a.md) и {{version}}.',
            '',
            '{% endnote %}',
            '',
            '```bash',
            'yfm -i . -o out',
            '```',
        ].join('\n');

        it('should accept a translation that preserves the structure', () => {
            const translated = source
                .replace('Заметки', 'Notes')
                .replace('Примечание со', 'A note with a')
                .replace('ссылкой', 'link');

            expect(compareMarkup(source, translated)).toEqual([]);
        });

        it('should report a translated fence body', () => {
            const translated = source.replace('yfm -i . -o out', 'yfm -i . -o output');

            expect(compareMarkup(source, translated)).toEqual([
                {type: 'fence-content', detail: expect.stringContaining('fence #1')},
            ]);
        });

        it('should report a lost note directive', () => {
            const translated = source.replace('{% note info %}\n\n', '');

            const violations = compareMarkup(source, translated);

            expect(violations).toEqual([{type: 'liquid', detail: expect.stringContaining('2')}]);
        });

        it('should report a changed link target', () => {
            const translated = source.replace('(../a.md)', '(../b.md)');

            expect(compareMarkup(source, translated)).toEqual([
                {type: 'links', detail: expect.stringContaining('../a.md')},
            ]);
        });

        it('should report a lost variable and a lost anchor', () => {
            const translated = source.replace('{{version}}', 'version').replace(' {#notes}', '');

            const types = compareMarkup(source, translated).map((violation) => violation.type);

            expect(types).toContain('variables');
            expect(types).toContain('headings');
        });
    });
});
