import {describe, expect, it} from 'vitest';

import {planText} from './index';

const join = (...blocks: string[]) => blocks.join('\n\n') + '\n';
const left = '## Début {#start}';
const right = '## Fin {#end}';
const localizedLeft = '## Start {#start}';
const localizedRight = '## End {#end}';

describe('Markdown block placement', () => {
    it('projects a deletion and an append without changing the other localized blocks', () => {
        const before = join(left, 'Ligne supprimée. {#remove}', right);
        const after = join(left, right, 'Nouvelle conclusion.');
        const target = join(localizedLeft, 'Remove this line. {#remove}', localizedRight);
        const plan = planText('markdown', before, after, target);

        expect(plan.input).toBe('Nouvelle conclusion.');
        expect(plan.apply('New conclusion.')).toBe(
            join(localizedLeft, localizedRight, 'New conclusion.'),
        );
    });

    it('preserves the target line ending and unchanged bytes at the start of an existing file', () => {
        const before = join(left, right);
        const target = join(localizedLeft, localizedRight).replace(/\n/g, '\r');
        const plan = planText('markdown', before, join('Préface.', left, right), target);

        expect(plan.apply('Preface.')).toBe('Preface.\r\r' + target);
    });

    it('can insert initial content into the empty target of an empty source', () => {
        const plan = planText('markdown', '', '\nPremière phrase.', '');

        expect(plan.apply('\nFirst sentence.\n')).toBe('\nFirst sentence.');
        expect(() => planText('markdown', '', 'Première phrase.', '\n')).toThrow(/boundary/);
    });

    it('requires a target for an existing source', () => {
        expect(() => planText('markdown', 'Texte.', 'Nouveau texte.', null)).toThrow(/no target/);
    });

    it('keeps approved bytes when only the source line ending changed', () => {
        const plan = planText(
            'markdown',
            join(left, right),
            join(left, right).replace(/\n/g, '\r\n'),
            'Approved.  ',
        );

        expect(plan.input).toBe('');
        expect(plan.apply('')).toBe('Approved.  ');
        expect(() => plan.apply('unrequested')).toThrow(/unexpected/i);
    });

    it('refuses to insert in an occupied target window', () => {
        const target = join(localizedLeft, 'A target-only explanation.', localizedRight);
        expect(() =>
            planText('markdown', join(left, right), join(left, 'Nouveau.', right), target),
        ).toThrow(/extra or displaced/);
    });

    it('refuses to remove a target-only paragraph sharing only an inline code identifier', () => {
        const source = join(left, 'Utiliser `config` ici.', right);
        const target = join(
            localizedLeft,
            'Target-only explanation about `config`.',
            localizedRight,
        );
        expect(() => planText('markdown', source, join(left, right), target)).toThrow(
            /no shared identity/,
        );
    });

    it('refuses a separator change that would loosen an unchanged list', () => {
        const before = join(left, '1. Premier\n2. Second', right);
        const after = join(left, '1. Premier\n\n2. Second', right);
        const target = join(localizedLeft, '1. First\n2. Second', localizedRight);

        expect(() => planText('markdown', before, after, target)).toThrow(/separators/);
    });

    it('does not select the wrong side of a replacement when a source boundary is absent', () => {
        const before = join('Chapitre sans identifiant.', right);
        const after = join('Chapitre sans identifiant.', 'Nouveau.', right);
        const target = join('Different paragraph.', 'Additional paragraph.', localizedRight);

        expect(() => planText('markdown', before, after, target)).toThrow(/left boundary/);
    });

    it('keeps distinct block IDs and refuses missing, reordered or empty translated blocks', () => {
        const plan = planText(
            'markdown',
            join(left, right),
            join(
                left,
                'Premier paragraphe.',
                'Deuxième paragraphe. {#second}',
                'Troisième paragraphe.',
                right,
            ),
            join(localizedLeft, localizedRight),
        );
        const translated = plan.input
            .replace('Premier paragraphe.', 'First paragraph.')
            .replace('Deuxième paragraphe.', 'Second paragraph.')
            .replace('Troisième paragraphe.', 'Third paragraph.');

        expect(plan.apply(translated)).toBe(
            join(
                localizedLeft,
                'First paragraph.',
                'Second paragraph. {#second}',
                'Third paragraph.',
                localizedRight,
            ),
        );
        expect(() => plan.apply('First paragraph.')).toThrow(/markers differ/);
        expect(() => plan.apply(translated.replace('block-2', 'block-3'))).toThrow(/reordered/);
        expect(() => plan.apply(translated.replace('Third paragraph.', ''))).toThrow(
            /invalid translated block/,
        );
    });

    it('retains a nested fenced example and does not resend its approved list item', () => {
        const first = '1. Élément avec `key`.';
        const last = '   Marqueur `tail`.';
        const fence = '   ````text\n   a\n   ```\n   b\n   ````';
        const after = join(left, first, '   Exemple.\n\n' + fence, last, right);
        const target = join(
            localizedLeft,
            '1. Approved item with `key`.  ',
            '   Approved `tail`.',
            localizedRight,
        );
        const plan = planText('markdown', join(left, first, last, right), after, target);

        expect(plan.input).toBe('Exemple.');
        expect(plan.apply('Example.')).toBe(
            target.replace(
                '   Approved `tail`.',
                '   Example.\n\n' + fence + '\n\n   Approved `tail`.',
            ),
        );
    });

    it('keeps fenced directives from closing a surrounding YFM container', () => {
        const container =
            '{% note info %}\n\n```txt\n{% endnote %}\n```\n\n{% cut Info %}\n\nText.\n\n{% endcut %}\n\n{% endnote %}';
        const plan = planText(
            'markdown',
            join(left, container, right),
            join(left, container, 'Annexe.', right),
            join(localizedLeft, container, localizedRight),
        );

        expect(plan.apply('Appendix.')).toContain(container + '\n\nAppendix.');
    });

    it('keeps local frontmatter with an indented delimiter unchanged', () => {
        const source = '---\ndescription: |\n  ---\n  Français\n---';
        const existing = '---\ndescription: |\n  ---\n  English\n---';
        const target = join(existing, localizedLeft, localizedRight);
        const plan = planText(
            'markdown',
            join(source, left, right),
            join(source, left, 'Paragraphe.', right),
            target,
        );

        expect(plan.apply('Paragraph.')).toBe(
            join(existing, localizedLeft, 'Paragraph.', localizedRight),
        );
    });

    it('rejects unclosed frontmatter at the start of the document', () => {
        const after = '---\ncomment: the delimiter never closes\n';
        expect(() => planText('markdown', join(left), after, join(localizedLeft))).toThrow(
            /unclosed frontmatter/,
        );
    });

    it.each([
        ['{% note info %}\n\nOpening with no closing directive.\n', /unclosed Markdown container/],
        ['[Guide][ref]\n\n[ref]: guide.md\n', /changed Markdown container/],
        ['Paragraph with <span>inline HTML</span>.\n', /changed Markdown container/],
    ])('refuses unsupported new blocks (%s)', (fragment, message) => {
        expect(() =>
            planText(
                'markdown',
                join(left, right),
                join(left, fragment, right),
                join(localizedLeft, localizedRight),
            ),
        ).toThrow(message);
    });

    it('refuses a valid automatic link addition if two identical target lists can act as the anchor', () => {
        const note = '{% note info %}\n\n- [{#T}](first.md)\n\n{% endnote %}';
        const addition = note.replace('first.md)', 'first.md)\n- [{#T}](second.md)');
        expect(() => planText('markdown', join(note), join(addition), join(note, note))).toThrow(
            /ambiguous/,
        );
    });

    it('keeps a wrapped note list and refuses unsolicited translator output', () => {
        const sourceNote = '{% note tip %}\n\n* [{#T}](root.md)\n\n{% endnote %}';
        const targetNote =
            ':::no-translate\n{% note tip "Reviewed" %}\n:::\n\n- [{#T}](root.md)\n\n:::no-translate\n{% endnote %}\n:::';
        const after = sourceNote.replace('root.md)', 'root.md)\n* [{#T}](child.md)');
        const plan = planText('markdown', join(sourceNote), join(after), join(targetNote));

        expect(plan.input).toBe('');
        expect(plan.apply('')).toBe(
            join(targetNote.replace('root.md)', 'root.md)\n- [{#T}](child.md)')),
        );
        expect(() => plan.apply('changed')).toThrow(/unexpected/);
    });
});

describe('YFM table placement', () => {
    const table = '#|\n|| Clé | Valeur ||\n|| `diameter` | Diamètre ||\n|#';
    const approvedTable = '#|\n|| Key | Value ||\n|| `diameter` | Diameter ||\n|#';
    const append = (text: string, row: string) => text.replace('|#', row + '\n|#');

    it('appends a structural row to the matching conditional branch and keeps its protected cells', () => {
        const condition = '{% if enabled %}';
        const before = join(condition + '\n' + table + '\n{% endif %}');
        const after = append(before, '|| :no-translate[`limit`] | [GET /limits](./limits.md) ||');
        const target = join(
            ':::no-translate\n' +
                condition +
                '\n:::\n' +
                approvedTable +
                '\n:::no-translate\n{% endif %}\n:::',
        ).replace(/\n/g, '\r\n');
        const plan = planText('markdown', before, after, target);

        expect(plan.input).toBe('');
        expect(plan.apply('')).toBe(
            target.replace('|#', '|| :no-translate[`limit`] | [GET /limits](./limits.md) ||\r\n|#'),
        );
        expect(() => plan.apply('extra')).toThrow(/unexpected/);
    });

    it('requires the original stable row keys and a unique target table', () => {
        const after = append(table, '|| `depth` | Profondeur ||');

        expect(() =>
            planText(
                'markdown',
                join(table),
                join(after),
                join(append(approvedTable, '|| `other` | Other ||')),
            ),
        ).toThrow(/target rows differ/);
        expect(() =>
            planText('markdown', join(table), join(after), join(approvedTable, approvedTable)),
        ).toThrow(/ambiguous table/);
    });

    it('rejects malformed and mixed table updates rather than rewriting existing rows', () => {
        expect(() =>
            planText(
                'markdown',
                join(table),
                join(append(table, '|| `diameter` | Encore ||')),
                join(approvedTable),
            ),
        ).toThrow(/container/);
        expect(() =>
            planText(
                'markdown',
                join(table),
                join(append(table, '|| `depth` | **Profondeur** ||')),
                join(approvedTable),
            ),
        ).toThrow(/cell content/);
        const after = join(append(table, '|| `depth` | Profondeur ||'), 'Un autre paragraphe.');
        expect(() => planText('markdown', join(table), after, join(approvedTable))).toThrow(
            /container/,
        );
    });

    it('requires exactly one output for every prose cell', () => {
        const after = append(table, '|| `depth` | Profondeur ||');
        const plan = planText('markdown', join(table), join(after), join(approvedTable));

        expect(() => plan.apply('Depth')).toThrow(/incomplete/);
        expect(() => plan.apply(plan.input.replace('cell-0', 'cell-1'))).toThrow(/cell changed/);
        expect(() => plan.apply(plan.input.replace('Profondeur', 'Depth | other text'))).toThrow(
            /cell changed/,
        );
    });
});
