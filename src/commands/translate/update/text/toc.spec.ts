import {describe, expect, it} from 'vitest';
import {parse, stringify} from 'yaml';

import {planText} from './index';

const before = 'title: Guide\nitems:\n  - {name: Accueil, href: index.md}\n';
const target = 'title: Handbook\nitems:\n - {name: Home, href: index.md}\n';
const append = (item: string) => before + '  - ' + item + '\n';
const newItem = '{name: Index, href: reference.md}';

describe('TOC navigation safety', () => {
    it('aligns a localized group by its unordered set of descendant links', () => {
        const source =
            before +
            [
                '  - name: Référence',
                '    items:',
                '      - {name: Premier, href: first.md}',
                '      - {name: Second, href: second.md}',
                '',
            ].join('\n');
        const approved =
            target +
            [
                ' - name: Reviewed reference',
                '   items:',
                '     - {name: Second, href: second.md}',
                '     - {name: First, href: first.md}',
                '',
            ].join('\n');
        const after = source + '      - {name: Résumé, href: summary.md}\n';
        const plan = planText('toc', source, after, approved);
        const translated = plan.apply(plan.input.replace('Résumé', 'Summary'));

        expect(translated).toBe(
            approved.replace(
                '     - {name: First',
                '     - {name: Summary, href: summary.md}\n     - {name: First',
            ),
        );
    });

    it('refuses a group that shares only some descendant links with the source anchor', () => {
        const source =
            before +
            '  - name: Référence\n    items:\n      - {name: A, href: a.md}\n      - {name: B, href: b.md}\n';
        const after = source + '      - {name: C, href: c.md}\n';
        const approved =
            target +
            ' - name: Reference\n   items:\n     - {name: A, href: a.md}\n     - {name: Other, href: locale.md}\n';

        expect(() => planText('toc', source, after, approved)).toThrow(/anchor list/);
    });

    it('keeps pagination-independent include options and appends to a target with no final newline', () => {
        const after = append('include: {path: sections/toc.yaml, mode: link}').trimEnd();
        const plan = planText('toc', before, after, target.trimEnd());

        expect(plan.input).toBe('');
        expect(plan.apply('')).toBe(target + ' - include: {path: sections/toc.yaml, mode: link}');
        expect(() => plan.apply('unexpected')).toThrow(/unexpected/);
    });

    it('places an insertion before the next target item even without a source final newline', () => {
        const after = before
            .replace('  - {name: Accueil', '  - ' + newItem + '\n  - {name: Accueil')
            .trimEnd();
        const plan = planText('toc', before, after, target.trimEnd());

        expect(plan.apply(plan.input.replace('Index', 'Reference'))).toBe(
            target
                .trimEnd()
                .replace(
                    ' - {name: Home',
                    ' - {name: Reference, href: reference.md}\n - {name: Home',
                ),
        );
    });

    it('uses YAML-safe quoting for flow commas, single quotes, and multiline labels', () => {
        const after =
            append(newItem) +
            "  - {name: 'Accès', href: access.md}\n" +
            '  - {name: "Liste", href: list.md}\n';
        const plan = planText('toc', before, after, target);
        const labels = parse(plan.input).items;
        labels[0].name = 'Reference, tools';
        labels[1].name = "What's new";
        labels[2].name = 'First\nSecond';

        expect(plan.apply(stringify({items: labels}))).toBe(
            target +
                ' - {name: "Reference, tools", href: reference.md}\n' +
                " - {name: 'What''s new', href: access.md}\n" +
                ' - {name: "First\\nSecond", href: list.md}\n',
        );
    });

    it.each([
        ['items: []\n', /anchor/],
        ['items: [{name: Home, href: index.md}]\n', /block-style/],
        ['items:\n - home\n', /items must be mappings/],
        ['items:\n - {when: condition}\n', /stable keys/],
        ['items: broken\n', /anchor list/],
        ['items: [\n', /valid YAML/],
        [target + ' - {name: Existing, href: reference.md}\n', /already exists/],
    ])('does not project into an unsupported localized TOC (%s)', (fixture, error) => {
        expect(() => planText('toc', before, append(newItem), fixture)).toThrow(error);
    });

    it.each([
        [append(newItem).replace('title: Guide', 'title: Manuel'), /only additions/],
        [append(newItem) + '  - {name: Duplicate, href: reference.md}\n', /source navigation keys/],
        [append(newItem).replace('  - {name: Accueil, href: index.md}\n', ''), /remove or reorder/],
        [append('{name: 123, href: reference.md}'), /string navigation label/],
        [append('name: >-\n      Long label\n    href: reference.md'), /single-line string/],
        [append('{name: Extra, href: reference.md, items: invalid}'), /must be a sequence/],
        [append('&new {name: Extra, href: reference.md}'), /YAML anchors/],
        [
            append('{name: *title, href: reference.md}').replace(
                'title: Guide',
                'title: &title Guide',
            ),
            /YAML aliases/,
        ],
        [append(newItem).replace('items:', 'navigation:'), /only additions/],
    ])('refuses unsupported source changes (%s)', (fixture, error) => {
        expect(() => planText('toc', before, fixture, target)).toThrow(error);
    });

    it('requires translated labels with their original identity', () => {
        const plan = planText('toc', before, append(newItem), target);
        const payload = parse(plan.input);

        expect(() =>
            plan.apply(stringify({items: [{...payload.items[0], href: 'wrong.md'}]})),
        ).toThrow(/missing or reordered/);
        expect(() => plan.apply(stringify({items: [{...payload.items[0], name: ' '}]}))).toThrow(
            /missing or reordered/,
        );
        expect(() => plan.apply(stringify({items: ['wrong']}))).toThrow(/missing or reordered/);
    });
});
