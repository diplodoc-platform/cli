import {describe, expect, it} from 'vitest';

import {planText} from './index';

const start = '## Inicio {#start}';
const end = '## Fin {#end}';
const targetStart = '## Start {#start}';
const targetEnd = '## End {#end}';
const document = (...blocks: string[]) => blocks.join('\n\n') + '\n';

describe('scoped Markdown updates', () => {
    it('refuses to select an occurrence of a duplicate source paragraph', () => {
        const repeat = 'Entrada repetida con `key`.';
        const before = document(start, repeat, repeat, end);
        const after = document(start, repeat, end);
        const target = document(
            targetStart,
            'First approved wording with `key`.',
            'Second approved wording with `key`.',
            targetEnd,
        );

        expect(() => planText('markdown', before, after, target)).toThrow(/repeated/i);
    });

    it('refuses a change when target paragraphs moved across stable anchors', () => {
        const shared = 'Esta entrada utiliza `source-key`. {#entry}';
        const split = '## Separador {#middle}';
        const before = document(start, shared, split, 'El contenido final.', end);
        const after = document(
            start,
            shared.replace('utiliza', 'comprueba'),
            split,
            'El contenido final.',
            end,
        );
        const target = document(
            targetStart,
            'Reviewed target prose.',
            '## Section {#middle}',
            'Approved entry with `source-key`. {#entry}',
            targetEnd,
        );

        expect(() => planText('markdown', before, after, target)).toThrow(/identities|anchor/i);
    });

    it('translates only inserted prose and preserves a balanced destination', () => {
        const before = document(start, end);
        const after = document(start, 'Lee [la guía](../topic(v2).md).', end);
        const target = document(targetStart, targetEnd, 'Target-only footer.  ').replace(
            /\n/g,
            '\r\n',
        );
        const plan = planText('markdown', before, after, target);

        expect(plan.input).toBe('Lee [la guía](../topic(v2).md).');
        expect(plan.apply('Read [the guide](../topic(v2).md).')).toBe(
            target.replace(targetEnd, 'Read [the guide](../topic(v2).md).\r\n\r\n' + targetEnd),
        );
        expect(() => plan.apply('Read [the guide](../topic(v3).md).')).toThrow(/structure/i);
    });

    it('splices an anchored prose change around an authored no-translate span', () => {
        const before = document(start, 'Usa :no-translate[[Raw Name](../path.md)]. {#usage}', end);
        const after = before.replace('Usa ', 'Comprueba ');
        const target = document(
            targetStart,
            'Use :no-translate[[Raw Name](../path.md)]. {#usage}',
            targetEnd,
            'Reviewed footer.',
        );
        const plan = planText('markdown', before, after, target);

        expect(plan.apply('Check :no-translate[[Raw Name](../path.md)]. {#usage}')).toBe(
            target.replace('Use ', 'Check '),
        );
        expect(() => plan.apply('Check :no-translate[[Other Name](../path.md)]. {#usage}')).toThrow(
            /no-translate/i,
        );
    });

    it('adds rows to a YFM table by stable keys without rewriting existing rows', () => {
        const before = '#|\n|| Clave | Descripción ||\n|| `length` | Longitud ||\n|#\n';
        const after = before.replace('|#', '|| `width` | Anchura en `cm` ||\n|#');
        const target =
            'Reviewed table.\r\n\r\n#|\r\n|| Key | Description ||\r\n|| `length` | Length ||\r\n|#';
        const plan = planText('markdown', before, after, target);

        expect(plan.input).toContain('Anchura en `cm`');
        expect(plan.input).not.toContain('Longitud');
        expect(plan.apply(plan.input.replace('Anchura en', 'Width in'))).toBe(
            target.replace('|#', '|| `width` | Width in `cm` ||\r\n|#'),
        );
        expect(() => plan.apply(plan.input.replace('`cm`', '`mm`'))).toThrow(/cell/i);
    });

    it('copies a structural addition without requiring translation', () => {
        const before = document(start, end);
        const after = document(start, '```sh\nprintf hello\n```', end);
        const target = document(targetStart, targetEnd);
        const plan = planText('markdown', before, after, target);

        expect(plan.input).toBe('');
        expect(plan.apply('')).toBe(document(targetStart, '```sh\nprintf hello\n```', targetEnd));
        expect(() => plan.apply('unrequested output')).toThrow(/unexpected/i);
    });

    it('appends a page-title link using the localized note and its wrapped destination style', () => {
        const before = document(
            '# Recursos',
            '{% note info %}\n\n* [{#T}](overview.md)\n\n{% endnote %}',
        );
        const after = before.replace('overview.md)\n', 'overview.md)\n* [{#T}](guide(v2).md)\n');
        const localized = document(
            '# Approved resources',
            '{% note info %}\n\n- [{#T}](:no-translate[overview.md])\n\n{% endnote %}',
        );
        const plan = planText('markdown', before, after, localized);

        expect(plan.input).toBe('');
        expect(plan.apply('')).toBe(
            localized.replace(
                'overview.md])\n',
                'overview.md])\n- [{#T}](:no-translate[guide(v2).md])\n',
            ),
        );
    });

    it('protects a new standalone include with a balanced destination', () => {
        const include = '{% include [Guía [rápida]](./guide(v2).md) %}';
        const plan = planText('markdown', null, include + '\r\n', null);

        expect(plan.input).toBe('');
        expect(plan.apply('')).toContain(':::no-translate\r\n' + include + '\r\n:::');
    });

    it('translates a new Markdown file and checks empty output and existing targets', () => {
        const plan = planText('markdown', null, 'Un documento.\n', null);

        expect(plan.input).toBe('Un documento.\n');
        expect(plan.apply('A document.\n')).toBe('A document.\n');
        expect(() => plan.apply(' \n')).toThrow(/empty/i);
        expect(() => planText('markdown', null, plan.input, 'Existing target.')).toThrow(/target/i);
        expect(planText('markdown', null, plan.input, plan.input).input).toBe('');
        expect(planText('markdown', null, '', null).apply('')).toBe('');
    });
});

describe('scoped TOC updates', () => {
    const before =
        'title: Manual\nitems:\n  - {name: Inicio, href: start.md}\n  - {name: Fin, href: end.md}\n';
    const target = [
        "title: 'Handbook' # reviewed",
        'items:',
        "   - {name: 'Start', href: start.md}",
        "   - {name: 'Locale appendix', href: locale.md}",
        "   - {name: 'End', href: end.md}",
        '',
    ].join('\r\n');

    it('translates new nested labels and preserves target indentation and line endings', () => {
        const after = before.replace(
            '  - {name: Fin',
            '  - name: Referencia\n    when: features.reference\n    items:\n      - {name: Campos, href: fields.md}\n  - {name: Fin',
        );
        const plan = planText('toc', before, after, target);

        expect(plan.input).toContain('Referencia');
        expect(plan.input).toContain('Campos');
        expect(plan.input).not.toMatch(/Inicio|features\.reference|fields\.md/);
        expect(
            plan.apply(plan.input.replace('Referencia', 'Reference').replace('Campos', 'Fields')),
        ).toBe(
            target.replace(
                "   - {name: 'Locale appendix'",
                [
                    '   - name: Reference',
                    '     when: features.reference',
                    '     items:',
                    '       - {name: Fields, href: fields.md}',
                    "   - {name: 'Locale appendix'",
                ].join('\r\n'),
            ),
        );
        expect(() => plan.apply('items: []\n')).toThrow(/label/i);
    });

    it('inserts a label-free include without invoking a translator', () => {
        const after = before + '  - include: extra/toc.yaml\n';
        const plan = planText('toc', before, after, target);

        expect(plan.input).toBe('');
        expect(plan.apply('')).toBe(target + '   - include: extra/toc.yaml\r\n');
    });

    it('keeps labels on their own entries when the parent label follows its children', () => {
        const after =
            before +
            ['  - items:', '      - {name: Tallas, href: sizes.md}', '    name: Guía', ''].join(
                '\n',
            );
        const plan = planText('toc', before, after, target);
        const translated = plan.input.replace('Tallas', 'Size ranges').replace('Guía', 'Guide');
        expect(plan.apply(translated)).toBe(
            target +
                [
                    '   - items:',
                    '       - {name: Size ranges, href: sizes.md}',
                    '     name: Guide',
                    '',
                ].join('\r\n'),
        );
    });

    it('retains a leading comment on the next item when only the right anchor exists', () => {
        const after = before.replace(
            '  - {name: Fin',
            '  - {name: Nuevo, href: new.md}\n  - {name: Fin',
        );
        const localized = ['items:', '  # Reviewed item', '  - {name: End, href: end.md}', ''].join(
            '\n',
        );
        const plan = planText('toc', before, after, localized);
        expect(plan.apply(plan.input.replace('Nuevo', 'New item'))).toBe(
            localized.replace('  #', '  - {name: New item, href: new.md}\n  #'),
        );
    });

    it('rejects ambiguous or reversed TOC anchors before translation', () => {
        const after = before.replace(
            '  - {name: Fin',
            '  - {name: Nuevo, href: new.md}\n  - {name: Fin',
        );
        const reversed =
            'items:\n   - {name: End, href: end.md}\n   - {name: Start, href: start.md}\n';
        const duplicate = target + '   - {name: Other Start, href: start.md}\r\n';

        expect(() => planText('toc', before, after, reversed)).toThrow(/anchor/i);
        expect(() => planText('toc', before, after, duplicate)).toThrow(/anchor/i);
    });
});
