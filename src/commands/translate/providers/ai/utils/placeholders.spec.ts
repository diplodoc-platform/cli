import {compose, extract} from '@diplodoc/translation';
import {describe, expect, it} from 'vitest';

import {keepsPlaceholders, maskAddresses, renumberMemory, unmaskAddresses} from './placeholders';

const COMMIT = 'https://github.com/ytsaurus/ytsaurus/commit/8013fee';
const ISSUE = 'https://github.com/ytsaurus/ytsaurus/issues/930';

// Units exactly as the AI translate run extracts them.
function units(markdown: string) {
    const {units: found, skeleton} = extract(markdown, {
        compact: true,
        unitLocalIds: true,
        source: {language: 'ru', locale: 'RU'},
        target: {language: 'en', locale: 'US'},
    });
    const texts = found.map((unit: string) => unit.replace(/^<source[^>]*>|<\/source>$/g, ''));

    return {texts, skeleton: skeleton as string};
}

function composed(skeleton: string, texts: string[]) {
    return compose(
        skeleton,
        texts.map((text) => `<source xml:space="preserve">${text}</source>`),
        {useSource: true},
    );
}

describe('maskAddresses', () => {
    it('should send a link contained in the fragment without its address', () => {
        const [unit] = units(`Исправлено в [коммите](${COMMIT}).`).texts;

        expect(unit).toContain(COMMIT);
        expect(maskAddresses(unit)).toBe('Исправлено в <g ctype="link" id="g-1">коммите</g>.');
    });

    it('should send the parts of a link crossing the fragment edge as one placeholder', () => {
        const [unit] = units(`- [Issue](${ISSUE}) исправлен.`).texts;

        // `]`, `(`, the address and `)` stand side by side in the unit.
        expect(unit.match(/<x /g)).toHaveLength(4);
        expect(maskAddresses(unit)).toBe(
            'Issue<x ctype="link_text_part_close" id="x-1"/> исправлен.',
        );
    });

    it('should hide image sources and autolinks too', () => {
        const [unit] = units('Схема ![картинка](img/scheme.png) и <https://auto.link>.').texts;

        expect(maskAddresses(unit)).toBe(
            'Схема <g ctype="image" id="g-1">картинка</g> и <x ctype="link_autolink" id="x-1"/>.',
        );
    });

    it('should keep other placeholders as they are', () => {
        const [unit] = units('Выполните `yfm build` и **сохраните** {{product}}.').texts;

        expect(maskAddresses(unit)).toBe(unit);
    });

    it('should leave a placeholder with a repeated id as it is', () => {
        const tag = `<g ctype="link" equiv-text="[{{text}}](${COMMIT})" id="g-1" x-begin="[" x-end="](${COMMIT})">`;
        const unit = `${tag}a</g> и ${tag}b</g>`;

        expect(maskAddresses(unit)).toBe(unit);
    });
});

describe('unmaskAddresses', () => {
    it('should give back the source for an echo of the masked fragment', () => {
        const markdown = [
            `- [Issue](${ISSUE}) исправлен, **важно**.`,
            `- Исправлено в [коммите](${COMMIT}) и ![картинке](img.png "Подпись").`,
        ].join('\n');

        for (const unit of units(markdown).texts) {
            expect(unmaskAddresses(unit, maskAddresses(unit))).toBe(unit);
        }
    });

    it('should take the address of a contained link from the source', () => {
        const {texts, skeleton} = units(`Исправлено в [8013fee](${COMMIT}).`);
        const broken = COMMIT.replace('ytsaurus/commit', 'ytsaurus/ytsaurus/commit');
        // The answer of a model that saw the address and rewrote it.
        const answer = texts[0]
            .replace('Исправлено в', 'Fixed in')
            .replace(new RegExp(COMMIT, 'g'), broken);

        expect(composed(skeleton, [unmaskAddresses(texts[0], answer)])).toBe(
            `Fixed in [8013fee](${COMMIT}).`,
        );
    });

    it('should take the address of a link crossing the edge from the source', () => {
        const {texts, skeleton} = units(`- [Issue](${ISSUE}) исправлен.`);
        const answer = 'Issue<x ctype="link_text_part_close" id="x-1"/> fixed.';

        expect(composed(skeleton, [unmaskAddresses(texts[0], answer)])).toBe(
            `- [Issue](${ISSUE}) fixed.`,
        );
    });

    it('should put back the type and markers of any placeholder', () => {
        const [unit] = units('Выполните `yfm build` сейчас.').texts;
        const answer =
            'Run <x id="x-1"/>yfm build<x ctype="code_close" equiv-text="\'" id="x-2"/> now.';

        expect(unmaskAddresses(unit, answer)).toBe(
            'Run <x ctype="code_open" equiv-text="`" id="x-1"/>yfm build' +
                '<x ctype="code_close" equiv-text="`" id="x-2"/> now.',
        );
    });

    it('should leave placeholders the source does not have as they are', () => {
        const [unit] = units(`Исправлено в [коммите](${COMMIT}).`).texts;
        const answer =
            'Fixed in <g ctype="link" id="g-1">commit</g> <x ctype="bold_open" id="x-7"/>.';

        expect(unmaskAddresses(unit, answer)).toContain('<x ctype="bold_open" id="x-7"/>');
    });
});

describe('renumberMemory', () => {
    // A model applying an edit to the existing translation: it copies the
    // memory as it got it and changes the edited word.
    function applyEdit(
        markdown: string,
        previous: string,
        existing: string,
        edit: [string, string],
    ) {
        const {texts, skeleton} = units(markdown);
        const fragment = texts[texts.length - 1];
        const hint = {
            source: units(previous).texts.at(-1) as string,
            translation: units(existing).texts.at(-1) as string,
        };
        const memory = renumberMemory(fragment, hint);
        const answer = maskAddresses(memory.translation).replace(...edit);
        const translation = unmaskAddresses(fragment, answer);

        return {
            source: maskAddresses(memory.source),
            translation: maskAddresses(memory.translation),
            kept: keepsPlaceholders(fragment, translation),
            composed: composed(skeleton, [...texts.slice(0, -1), translation]),
        };
    }

    it('should keep links apart when the translation has them in another order', () => {
        const result = applyEdit(
            'Edit the [computation](stream.md) [spec](spec.md) there.',
            'Edit the [computation](stream.md) [spec](spec.md) here.',
            'Измените [спеку](spec.md) [вычисления](stream.md) здесь.',
            ['здесь', 'там'],
        );

        expect(result.translation).toBe(
            'Измените <g ctype="link" id="g-2">спеку</g> <g ctype="link" id="g-1">вычисления</g> здесь.',
        );
        expect(result.composed).toBe('Измените [спеку](spec.md) [вычисления](stream.md) там.');
    });

    it('should keep other placeholders apart the same way', () => {
        const {composed: line} = applyEdit(
            'Set `limit` for {{product}} there.',
            'Set `limit` for {{product}} here.',
            'Для {{product}} задайте `limit` здесь.',
            ['здесь', 'там'],
        );

        expect(line).toBe('Для {{product}} задайте `limit` там.');
    });

    it('should give a link with another address the source one', () => {
        const replication = 'https://en.wikipedia.org/wiki/Replication';
        const {kept, composed: line} = applyEdit(
            `See [replication](${replication}) there.`,
            `See [replication](${replication}) here.`,
            'См. [репликацию](https://ru.wikipedia.org/wiki/Replication) здесь.',
            ['здесь', 'там'],
        );

        expect(kept).toBe(true);
        expect(line).toBe(`См. [репликацию](${replication}) там.`);
    });

    it('should follow links the edit gave other addresses', () => {
        const {
            source,
            kept,
            composed: line,
        } = applyEdit(
            'See [install](new/install.md) and [setup](new/setup.md) here.',
            'See [install](old/install.md) and [setup](old/setup.md) here.',
            'См. [установку](old/install.md) и [настройку](old/setup.md) здесь.',
            ['', ''],
        );

        expect(source).toBe(
            'See <g ctype="link" id="g-1">install</g> and <g ctype="link" id="g-2">setup</g> here.',
        );
        expect(kept).toBe(true);
        expect(line).toBe('См. [установку](new/install.md) и [настройку](new/setup.md) здесь.');
    });

    it('should match links with titles numbered in another file', () => {
        const {translation, kept} = applyEdit(
            'First. Second.\n\nUse [a](a.md "Title A") and [b](b.md "Title B") there.',
            'First. Second.\n\nUse [a](a.md "Title A") and [b](b.md "Title B") here.',
            'Первое.\n\nИспользуйте [а](a.md "Титул А") и [б](b.md "Титул Б") здесь.',
            ['здесь', 'там'],
        );

        expect(translation).toBe(
            'Используйте <g ctype="link" id="g-1">а</g> и <g ctype="link" id="g-2">б</g> здесь.',
        );
        expect(kept).toBe(true);
    });

    it('should not let a link of the memory stand for a link of the fragment it does not match', () => {
        const {translation, kept} = applyEdit(
            'See [a](a.md) and [b](b.md) there.',
            'See [a](a.md) and [b](b.md) here.',
            'См. [в](c.md) и [г](d.md) здесь.',
            ['здесь', 'там'],
        );

        expect(translation).toBe(
            'См. <g ctype="link" id="g-m1">в</g> и <g ctype="link" id="g-m2">г</g> здесь.',
        );
        expect(kept).toBe(false);
    });

    it('should give a link the fragment no longer has the same spare id on both sides', () => {
        const {source, translation} = applyEdit(
            'See the docs there.',
            'See [the docs](docs.md) here.',
            'См. [документацию](docs.md) здесь.',
            ['здесь', 'там'],
        );

        expect(source).toBe('See <g ctype="link" id="g-m1">the docs</g> here.');
        expect(translation).toBe('См. <g ctype="link" id="g-m1">документацию</g> здесь.');
    });

    it('should pair a run of link parts with another address as a whole', () => {
        const {
            translation,
            kept,
            composed: line,
        } = applyEdit(
            `- [Issue](${ISSUE}) исправлен.`,
            `- [Issue](${ISSUE}) исправлен.`,
            `- [Задача](${ISSUE.replace('930', '931')}) fixed.`,
            ['fixed', 'исправлена'],
        );

        expect(translation).toBe('Задача<x ctype="link_text_part_close" id="x-1"/> fixed.');
        expect(kept).toBe(true);
        expect(line).toBe(`- [Задача](${ISSUE}) исправлена.`);
    });
});

describe('keepsPlaceholders', () => {
    const markdown = [
        `- [Issue](${ISSUE}) исправлен.`,
        `- Исправлено в [коммите](${COMMIT}) и [задаче](${ISSUE}).`,
    ].join('\n');
    const [edge, contained] = units(markdown).texts;
    const translate = (unit: string, answer: string) => unmaskAddresses(unit, answer);

    it('should accept links kept in place', () => {
        const answer = 'Issue<x ctype="link_text_part_close" id="x-1"/> fixed.';

        expect(keepsPlaceholders(edge, translate(edge, answer))).toBe(true);
    });

    it('should accept links the translation reorders', () => {
        const answer =
            'In <g ctype="link" id="g-2">the issue</g> and <g ctype="link" id="g-1">the commit</g>.';

        expect(keepsPlaceholders(contained, translate(contained, answer))).toBe(true);
    });

    it('should reject a link that lost a part of it', () => {
        // deepseek-v4-flash, unmasked: `]` is gone and the line composes
        // into `[Issue(https://...)`.
        const answer = edge.replace(/<x ctype="link_text_part_close"[^>]*\/>/, '');

        expect(keepsPlaceholders(edge, answer)).toBe(false);
    });

    it('should reject a link placeholder the model dropped', () => {
        expect(keepsPlaceholders(edge, translate(edge, 'Issue fixed.'))).toBe(false);
    });

    it('should reject a repeated link placeholder', () => {
        const answer =
            'Issue<x ctype="link_text_part_close" id="x-1"/> fixed' +
            '<x ctype="link_text_part_close" id="x-1"/>.';

        expect(keepsPlaceholders(edge, translate(edge, answer))).toBe(false);
    });

    it('should reject a link placeholder the source does not have', () => {
        const answer =
            'Fixed in <g ctype="link" id="g-1">commit</g> and <g ctype="link" id="g-2">issue</g>' +
            ' <x ctype="link_attributes_href" equiv-text="https://evil" id="x-9"/>.';

        expect(keepsPlaceholders(contained, translate(contained, answer))).toBe(false);
    });

    it('should reject a placeholder of its own without a type', () => {
        const answer =
            'Fixed in <g ctype="link" id="g-1">commit</g> and <g ctype="link" id="g-2">issue</g><x id="x-9"/>.';

        expect(keepsPlaceholders(contained, translate(contained, answer))).toBe(false);
    });

    it('should reject a link left open', () => {
        const answer =
            'Fixed in <g ctype="link" id="g-1">commit and <g ctype="link" id="g-2">issue</g>.';

        expect(keepsPlaceholders(contained, translate(contained, answer))).toBe(false);
    });

    it('should leave emphasis and code to keepsMarkup', () => {
        const [unit] = units('Выполните `yfm build` и **сохраните**.').texts;

        // The model wrote the markers itself instead of the placeholders.
        expect(keepsPlaceholders(unit, 'Run `yfm build` and **save**.')).toBe(true);
    });
});
