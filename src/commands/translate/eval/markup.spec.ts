import {describe, expect, it} from 'vitest';

import {compareMarkup, markupSignature, normalizeLiquidTag} from './markup';

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
            expect(signature.tables.pipeRows).toBe(3);
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
