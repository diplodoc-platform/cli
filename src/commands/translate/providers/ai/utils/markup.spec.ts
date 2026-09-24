import {compose, extract} from '@diplodoc/translation';
import {describe, expect, it} from 'vitest';

import {keepsMarkup, restoreHoistedMarkers, stripAddedMarkup} from './markup';

// Units below are real `extract` output: the markers of markup that
// starts (or ends) outside the fragment live in the skeleton, and only a
// self-closing tag stays in the unit.
const BOLD_CLOSE = '<x ctype="bold_close" equiv-text="**" id="x-1"/>';
const BOLD_OPEN = '<x ctype="bold_open" equiv-text="**" id="x-1"/>';
const CODE_OPEN = '<x ctype="code_open" equiv-text="`" id="x-1"/>';
const CODE_CLOSE = '<x ctype="code_close" equiv-text="`" id="x-2"/>';
const STRIKE_CLOSE = '<x ctype="strikethrough_close" equiv-text="~~" id="x-1"/>';
const BOLD_TAG = '<g ctype="bold" equiv-text="**{{text}}**" id="g-1" x-begin="**" x-end="**">';
const ITALIC_TAG = '<g ctype="italic" equiv-text="*{{text}}*" id="g-2" x-begin="*" x-end="*">';
const LINK_TAG =
    '<g ctype="link" equiv-text="[{{text}}](http://x)" id="g-1" x-begin="[" x-end="](http://x)">';

describe('stripAddedMarkup', () => {
    it('should strip an opener added to a fragment of a bold label', () => {
        const source = `Release date:${BOLD_CLOSE} 2026-08-25`;

        expect(stripAddedMarkup(source, '**Дата релиза:** 2026-08-25')).toEqual({
            text: 'Дата релиза:** 2026-08-25',
            stripped: 1,
        });
    });

    it('should strip both the opener and the marker duplicating the tag', () => {
        const source = `Release date:${BOLD_CLOSE} 2026-08-25`;

        expect(stripAddedMarkup(source, `**Дата релиза:**${BOLD_CLOSE} 2026-08-25`)).toEqual({
            text: `Дата релиза:${BOLD_CLOSE} 2026-08-25`,
            stripped: 2,
        });
    });

    it('should strip both markers when the model wraps a fragment of a bold label', () => {
        const source = `Release date:${BOLD_CLOSE} 2026-08-25`;

        // The opening marker duplicates the skeleton one and the closing
        // marker is left without a partner once it is cut.
        expect(stripAddedMarkup(source, `**Дата релиза:${BOLD_CLOSE} 2026-08-25**`)).toEqual({
            text: `Дата релиза:${BOLD_CLOSE} 2026-08-25`,
            stripped: 2,
        });
    });

    it('should keep markup the model added next to a repaired edge', () => {
        const source = `Release date:${BOLD_CLOSE} 2026-08-25`;

        // The marker after the label replaces the tag the model dropped,
        // and the pair around the last word is sound markup of its own.
        expect(stripAddedMarkup(source, '**Дата релиза:** 2026-08-25 **важно**')).toEqual({
            text: 'Дата релиза:** 2026-08-25 **важно**',
            stripped: 1,
        });
    });

    it('should strip a lone marker left at a free edge', () => {
        expect(stripAddedMarkup('Plain sentence.', 'Обычное предложение.**')).toEqual({
            text: 'Обычное предложение.',
            stripped: 1,
        });
    });

    it('should strip a closer added to a fragment whose bold ends in the skeleton', () => {
        const source = `Text ending with ${BOLD_OPEN}bold`;

        expect(stripAddedMarkup(source, 'Текст, оканчивающийся **жирным**')).toEqual({
            text: 'Текст, оканчивающийся **жирным',
            stripped: 1,
        });
    });

    it('should strip a marker duplicating an opening tag', () => {
        const source = `Text ending with ${BOLD_OPEN}bold`;

        expect(stripAddedMarkup(source, `Текст, оканчивающийся ${BOLD_OPEN}**жирным`)).toEqual({
            text: `Текст, оканчивающийся ${BOLD_OPEN}жирным`,
            stripped: 1,
        });
    });

    it('should strip the markers wrapped around a fragment with no markup at all', () => {
        expect(stripAddedMarkup('Plain sentence.', '**Обычное предложение.**')).toEqual({
            text: 'Обычное предложение.',
            stripped: 2,
        });
    });

    it('should strip underscore emphasis the same way', () => {
        const source = `Note:${'<x ctype="italic_close" equiv-text="_" id="x-1"/>'} read it`;

        expect(stripAddedMarkup(source, '_Примечание:_ прочтите')).toEqual({
            text: 'Примечание:_ прочтите',
            stripped: 1,
        });
    });

    it('should strip backticks added to a fragment of an inline code span', () => {
        const source = `code span${CODE_CLOSE} at the start`;

        expect(stripAddedMarkup(source, '`фрагмент кода` в начале')).toEqual({
            text: 'фрагмент кода` в начале',
            stripped: 1,
        });
    });

    it('should strip strikethrough added to a fragment of a struck out line', () => {
        const source = `struck out${STRIKE_CLOSE} at the start`;

        expect(stripAddedMarkup(source, '~~зачёркнуто~~ в начале')).toEqual({
            text: 'зачёркнуто~~ в начале',
            stripped: 1,
        });
    });

    it('should strip a backtick glued outside a code placeholder', () => {
        const source = `Enable it with ${CODE_OPEN}a.b.c`;

        expect(stripAddedMarkup(source, `Включите с помощью \`${CODE_OPEN}a.b.c`)).toEqual({
            text: `Включите с помощью ${CODE_OPEN}a.b.c`,
            stripped: 1,
        });
    });

    it('should strip a backtick written after a closing placeholder', () => {
        const source = `Use ${CODE_OPEN}z.w${CODE_CLOSE} as alias`;

        expect(stripAddedMarkup(source, `Берите ${CODE_OPEN}z.w${CODE_CLOSE}\` как алиас`)).toEqual(
            {
                text: `Берите ${CODE_OPEN}z.w${CODE_CLOSE} как алиас`,
                stripped: 1,
            },
        );
    });

    it('should strip backticks wrapped around a fragment with no markup at all', () => {
        expect(stripAddedMarkup('yfm build', '`yfm build`')).toEqual({
            text: 'yfm build',
            stripped: 2,
        });
    });

    it('should keep the backticks of a code span contained in the fragment', () => {
        // Both placeholders live in the unit, so the skeleton restores
        // nothing around it and the backticks the model wrote are the only
        // markup left - even though they sit at the very edge.
        const source = `Run ${CODE_OPEN}yfm build${CODE_CLOSE} in the project root`;
        const translation = 'В корне проекта выполните `yfm build`';

        expect(stripAddedMarkup(source, translation)).toEqual({text: translation, stripped: 0});
    });

    it('should strip a backtick restored around a fragment of two code spans', () => {
        // `abc` text `def`: both placeholders are unpaired, so both edges
        // of the fragment really are inside a code span.
        const source = `abc${CODE_CLOSE} text ${CODE_OPEN}def`;

        expect(stripAddedMarkup(source, '`абв` текст `гдё`')).toEqual({
            text: 'абв` текст `гдё',
            stripped: 2,
        });
    });

    it('should strip a pair the model wrapped around a fragment of its own code', () => {
        // The code span the fragment came with is still there, so the pair
        // around the whole of it is the model's own.
        const source = `Run ${CODE_OPEN}yfm build${CODE_CLOSE} in the project root`;

        expect(
            stripAddedMarkup(source, `\`Запустите ${CODE_OPEN}yfm build${CODE_CLOSE} в корне\``),
        ).toEqual({
            text: `Запустите ${CODE_OPEN}yfm build${CODE_CLOSE} в корне`,
            stripped: 2,
        });
    });

    it('should keep a pair the model wrote in place of a tag it lost', () => {
        // Removing it would leave the fragment without the bold it came
        // with, so the pair stays even though it wraps the whole text.
        const source = `The ${BOLD_TAG}quick brown fox</g>`;

        expect(stripAddedMarkup(source, '**Быстрая бурая лиса**')).toEqual({
            text: '**Быстрая бурая лиса**',
            stripped: 0,
        });
    });

    it('should leave a marker the repair cannot place for the check to catch', () => {
        // The model lost the closing tag and left an opener the skeleton
        // already provides: stripping it is right, and what stays is for
        // `keepsMarkup` to reject so the fragment is retried.
        const source = `Release date:${BOLD_CLOSE} 2026-08-25`;
        const repair = stripAddedMarkup(source, '**Дата релиза: 2026-08-25');

        expect(repair).toEqual({text: 'Дата релиза: 2026-08-25', stripped: 1});
        expect(keepsMarkup(source, repair.text)).toBe(false);
    });

    it('should keep markers the model wrote instead of a lost inline tag', () => {
        const source = `The ${BOLD_TAG}quick</g> fox`;

        expect(stripAddedMarkup(source, '**Быстрая** лиса')).toEqual({
            text: '**Быстрая** лиса',
            stripped: 0,
        });
    });

    it('should keep markers when the fragment starts with an inline tag', () => {
        const source = `${LINK_TAG}link</g> and more`;

        expect(stripAddedMarkup(source, '**ссылка** и ещё')).toEqual({
            text: '**ссылка** и ещё',
            stripped: 0,
        });
    });

    it('should keep a marker the skeleton does not restore on that side', () => {
        const source = `Release date:${BOLD_CLOSE} 2026-08-25`;

        expect(stripAddedMarkup(source, '_Дата релиза:_ 2026-08-25')).toEqual({
            text: '_Дата релиза:_ 2026-08-25',
            stripped: 0,
        });
    });

    it('should keep emphasis inside the fragment', () => {
        const source = `Release date:${BOLD_CLOSE} today`;

        expect(stripAddedMarkup(source, 'Дата релиза:** **сегодня** и позже')).toEqual({
            text: 'Дата релиза:** **сегодня** и позже',
            stripped: 0,
        });
    });

    it('should not touch inline code markers', () => {
        const source = `Run ${CODE_OPEN}yfm build${CODE_CLOSE} now`;
        const translation = `Запустите ${CODE_OPEN}yfm build${CODE_CLOSE} сейчас`;

        expect(stripAddedMarkup(source, translation)).toEqual({
            text: translation,
            stripped: 0,
        });
    });

    it('should leave a clean translation as is', () => {
        const source = `Release date:${BOLD_CLOSE} 2026-08-25`;
        const translation = `Дата релиза:${BOLD_CLOSE} 2026-08-25`;

        expect(stripAddedMarkup(source, translation)).toEqual({text: translation, stripped: 0});
    });

    it('should not take a bare marker run for emphasis', () => {
        expect(stripAddedMarkup('2 * 3 = 6', '2 * 3 = 6')).toEqual({
            text: '2 * 3 = 6',
            stripped: 0,
        });
    });
});

describe('keepsMarkup', () => {
    const source = `x.y${CODE_CLOSE} is the prefix, ${CODE_OPEN}z.w${CODE_CLOSE} kept as alias`;

    it('should not take underscores inside code for emphasis', () => {
        expect(
            keepsMarkup('Support row cache', `Поддержка ${CODE_OPEN}row_cache${CODE_CLOSE}`),
        ).toBe(true);
    });

    it('should accept a translation that keeps every placeholder', () => {
        const translation = `x.y${CODE_CLOSE} это префикс, ${CODE_OPEN}z.w${CODE_CLOSE} как алиас`;

        expect(keepsMarkup(source, translation)).toBe(true);
    });

    it('should accept a marker written in place of a dropped placeholder', () => {
        // Both compose into the same line, so the fragment is sound.
        expect(keepsMarkup(source, 'x.y` это префикс, `z.w` как алиас')).toBe(true);
    });

    it('should accept markup the model added of its own', () => {
        const translation = `x.y${CODE_CLOSE} это **префикс**, ${CODE_OPEN}z.w${CODE_CLOSE} как алиас`;

        expect(keepsMarkup(source, translation)).toBe(true);
    });

    it('should reject a placeholder dropped without its marker', () => {
        const translation = `x.y${CODE_CLOSE} это префикс, z.w${CODE_CLOSE} как алиас`;

        expect(keepsMarkup(source, translation)).toBe(false);
    });

    it('should reject an odd marker the repair could not place', () => {
        const translation = `x.y${CODE_CLOSE} это \`префикс, ${CODE_OPEN}z.w${CODE_CLOSE} как алиас`;

        expect(keepsMarkup(source, translation)).toBe(false);
    });

    it('should accept nested emphasis written as one delimiter run', () => {
        // ***text*** travels as an italic tag around a bold one, and comes
        // back as a single three-marker run: the same three characters.
        const nested = `This is ${ITALIC_TAG}${BOLD_TAG}very important</g></g> text.`;

        expect(keepsMarkup(nested, 'Это ***очень важный*** текст.')).toBe(true);
    });

    it('should accept a code span the model wrote with its own backticks', () => {
        const code = `Run ${CODE_OPEN}yfm build${CODE_CLOSE} in the project root`;

        expect(keepsMarkup(code, 'В корне проекта выполните `yfm build`')).toBe(true);
    });

    it('should reject a two-character delimiter left without a partner', () => {
        // Two characters but one delimiter: counting characters alone would
        // take it for a pair the model added of its own.
        expect(
            keepsMarkup('Plain sentence without any markup', 'Обычное предложение без **разметки'),
        ).toBe(false);
        expect(keepsMarkup('Plain sentence', 'Обычное ~~предложение')).toBe(false);
        expect(keepsMarkup('Plain sentence', 'Обычное __предложение')).toBe(false);
        expect(keepsMarkup('Plain sentence', 'Обычное ``предложение')).toBe(false);
    });

    it('should reject a delimiter run of the wrong length', () => {
        // Same number of delimiters and one more character: the run no
        // longer matches the marker the skeleton restores.
        expect(
            keepsMarkup(`Release date:${BOLD_CLOSE} 2026-08-25`, 'Дата релиза:*** 2026-08-25'),
        ).toBe(false);
        expect(
            keepsMarkup(
                `Run ${CODE_OPEN}yfm build${CODE_CLOSE} in the project root`,
                'Запустите `yfm build`` в корне проекта',
            ),
        ).toBe(false);
    });

    it('should accept markers regrouped into one run of the same length', () => {
        // **Bold *italic*** tail: the italic closer and the bold closer
        // come back merged, and the line composes byte for byte.
        const source = `Bold ${ITALIC_TAG}italic</g>${BOLD_CLOSE} tail`;

        expect(keepsMarkup(source, 'Жирный *курсив*** хвост')).toBe(true);
    });

    it('should accept a link written in plain markdown instead of its tags', () => {
        const link = `${LINK_TAG}link</g> and more`;

        expect(keepsMarkup(link, '[ссылка](http://x) и ещё')).toBe(true);
    });
});

const DOC = [
    '# Release notes',
    '',
    '**Release date:** 2026-08-25',
    '',
    '**Version:** 24.2 with a [link](http://x) and `code`.',
    '',
    'A sentence with a **bold word** and *italic* inside.',
    '',
    '- **Term:** definition continues **bold**',
    '- Plain item',
    '',
    '| **Header:** value |',
    '| --- |',
    '| **Cell:** data |',
    '',
    'Text ending with **bold**',
    '',
].join('\n');

const wrap = (text: string) => `<source xml:space="preserve">${text}</source>`;
const unwrap = (unit: string) => unit.replace(/^<source[^>]*>|<\/source>$/g, '');

/** A model that puts the markers of a bold label back into the fragment. */
function addMarkers(text: string): string {
    return text.replace(/^([^<]+:)(<x[^>]*\/>)?/, (_, label, tag) => `**${label}**${tag || ''}`);
}

/** A model that wraps the whole fragment it was given into markers. */
function wrapMarkers(text: string): string {
    return `**${text}**`;
}

/**
 * A model that drops the placeholders and writes their markers itself.
 * The line composes exactly the same way, so nothing may be stripped.
 */
function inlineMarkers(text: string): string {
    return text.replace(/<x [^>]*equiv-text="([^"]*)"[^>]*\/>/g, '$1');
}

/**
 * A model that keeps the code placeholders and writes the backticks it
 * sees in the rendered line as well, outside of the pair.
 */
function addCodeMarkers(text: string): string {
    return text
        .replace(/<x ctype="code_open"[^>]*\/>/g, '`$&')
        .replace(/<x ctype="code_close"[^>]*\/>/g, '$&`');
}

// Every markup shape the repair has to survive: inline code opening a line
// next to a second code span in the same sentence, a code span closing a
// line, code inside bold, and bold inside a paragraph.
const CODE_DOC = [
    '`x.y` is the prefix, `z.w` kept as alias',
    '',
    'Enable it with `a.b.c`',
    '',
    '**bold `code` mix** start',
    '',
    'A sentence with a **bold word** inside.',
    '',
].join('\n');

function extractDoc(doc: string) {
    return extract(doc, {
        compact: true,
        source: {language: 'en', locale: 'US'},
        target: {language: 'ru', locale: 'RU'},
    });
}

function repair(doc: string, model: (text: string) => string) {
    const {units, skeleton} = extractDoc(doc);
    const dirty = units.map((unit: string) => wrap(model(unwrap(unit))));
    const repaired = units.map((unit: string, index: number) =>
        wrap(stripAddedMarkup(unwrap(unit), unwrap(dirty[index])).text),
    );

    return {
        dirty: String(compose(skeleton, dirty, {useSource: true})),
        repaired: String(compose(skeleton, repaired, {useSource: true})),
    };
}

describe('stripAddedMarkup over real extract and compose', () => {
    it('should compose exactly like the source when the model adds markers', () => {
        const {dirty, repaired} = repair(DOC, addMarkers);

        expect(dirty).toContain('****');
        expect(repaired).toBe(DOC);
    });

    it('should compose exactly like the source when the model wraps a label', () => {
        const doc = '**Release date:** 2026-08-25\n';
        const {dirty, repaired} = repair(doc, wrapMarkers);

        expect(dirty).toContain('****');
        expect(repaired).toBe(doc);
    });

    it('should compose exactly like the source when the model adds backticks', () => {
        const doc = '`yfm build` at the start of a line\n';
        const {dirty, repaired} = repair(doc, (text) => `\`${text}\``);

        expect(dirty).toContain('``');
        expect(repaired).toBe(doc);
    });

    it('should compose exactly like the source when the model doubles the backticks', () => {
        const {dirty, repaired} = repair(CODE_DOC, addCodeMarkers);

        expect(dirty).toContain('``');
        expect(repaired).toBe(CODE_DOC);
    });

    it('should keep the markers a model writes instead of the placeholders', () => {
        const {repaired} = repair(CODE_DOC, inlineMarkers);

        expect(repaired).toBe(CODE_DOC);
    });

    it('should keep a faithful translation untouched', () => {
        expect(repair(DOC, (text) => text).repaired).toBe(DOC);
        expect(repair(CODE_DOC, (text) => text).repaired).toBe(CODE_DOC);
    });
});

describe('restoreHoistedMarkers', () => {
    // A code span ending a translation loses its closing marker to the
    // translation's own skeleton; composed with the source skeleton it
    // would stay open.
    const RESTORED_CLOSE = '<x ctype="code_close" equiv-text="`" id="x-r1"/>';
    const RESTORED_OPEN = '<x ctype="code_open" equiv-text="`" id="x-r1"/>';

    it('should append the closing marker of a code span hoisted after the translation', () => {
        const translation = `Метод ${CODE_OPEN}wait_for${CODE_CLOSE} перенесён в ${CODE_OPEN}spyt.connect`;

        expect(restoreHoistedMarkers('Move wait_for method to spyt.connect', translation)).toBe(
            translation + RESTORED_CLOSE,
        );
    });

    it('should prepend the opening marker of a code span hoisted before the translation', () => {
        const translation = `spyt.connect${CODE_CLOSE} теперь содержит метод`;

        expect(restoreHoistedMarkers('The method now lives in spyt.connect', translation)).toBe(
            RESTORED_OPEN + translation,
        );
    });

    it('should leave a marker the source skeleton restores as well', () => {
        // Both fragments end inside a code span: the source skeleton puts
        // the closing marker back after the translation.
        const source = `Move wait_for method to ${CODE_OPEN}spyt.connect`;
        const translation = `Метод wait_for перенесён в ${CODE_OPEN}spyt.connect`;

        expect(restoreHoistedMarkers(source, translation)).toBe(translation);
    });

    it('should leave a translation whose markup is contained in it', () => {
        const translation = `Метод ${CODE_OPEN}wait_for${CODE_CLOSE} перенесён`;

        expect(restoreHoistedMarkers('Move wait_for method', translation)).toBe(translation);
    });

    it('should restore emphasis the same way', () => {
        const translation = `Дата релиза:${BOLD_CLOSE} 2026-08-25`;

        expect(restoreHoistedMarkers('Release date: 2026-08-25', translation)).toBe(
            '<x ctype="bold_open" equiv-text="**" id="x-r1"/>' + translation,
        );
    });
});
