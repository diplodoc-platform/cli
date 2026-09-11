import {compose, extract} from '@diplodoc/translation';
import {describe, expect, it} from 'vitest';

import {stripAddedMarkup} from './markup';

// Units below are real `extract` output: the markers of markup that
// starts (or ends) outside the fragment live in the skeleton, and only a
// self-closing tag stays in the unit.
const BOLD_CLOSE = '<x ctype="bold_close" equiv-text="**" id="x-1"/>';
const BOLD_OPEN = '<x ctype="bold_open" equiv-text="**" id="x-1"/>';
const CODE_OPEN = '<x ctype="code_open" equiv-text="`" id="x-1"/>';
const CODE_CLOSE = '<x ctype="code_close" equiv-text="`" id="x-2"/>';
const STRIKE_CLOSE = '<x ctype="strikethrough_close" equiv-text="~~" id="x-1"/>';
const BOLD_TAG = '<g ctype="bold" equiv-text="**{{text}}**" id="g-1" x-begin="**" x-end="**">';
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

    it('should strip backticks wrapped around a fragment with no markup at all', () => {
        expect(stripAddedMarkup('yfm build', '`yfm build`')).toEqual({
            text: 'yfm build',
            stripped: 2,
        });
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

    it('should keep a faithful translation untouched', () => {
        const {repaired} = repair(DOC, (text) => text);

        expect(repaired).toBe(DOC);
    });
});
