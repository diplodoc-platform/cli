import {describe, expect, it} from 'vitest';

import {buildJudgeMessages, parseJudgeResponse} from '../providers/ai/judge';
import {buildMessages} from '../providers/ai/prompts';

import {
    CAPTURE_USER_PROMPT,
    JUDGE_PROMPT_MARKER,
    buildJudgeResponse,
    buildTranslateResponse,
    buildTranslationMemory,
    isJudgeRequest,
    makeTmLookup,
    normalizeUnitIds,
    parseCaptureRequest,
    parseJudgePairs,
    scoreJudgePair,
    stripPromptPreamble,
} from './mock';

const PROMPT_CONFIG = {
    promptMode: 'append' as const,
    sourceLanguage: 'ru-RU',
    targetLanguage: 'en-US',
    glossaryPairs: [{sourceText: 'заметка', translatedText: 'note'}],
    context: 'document "Обзор" (file ru/about.md)',
};

describe('translate eval mock provider', () => {
    describe('judge request detection', () => {
        it('should recognize real judge messages by the prompt marker', () => {
            // Drift guard: if the judge system prompt loses this phrase,
            // the mock would answer judge requests with translations.
            const messages = buildJudgeMessages(
                [{path: 'a.md', source: 'Один', translation: 'One'}],
                'ru',
                'en',
            );

            expect(messages[0].content).toContain(JUDGE_PROMPT_MARKER);
            expect(isJudgeRequest(messages)).toBe(true);
        });

        it('should not recognize translation messages', () => {
            const messages = buildMessages(['Привет'], PROMPT_CONFIG);

            expect(isJudgeRequest(messages)).toBe(false);
        });
    });

    describe('normalizeUnitIds', () => {
        it('should strip volatile inline element ids', () => {
            const first =
                'Текст <x ctype="code_open" equiv-text="`" id="x-3"/>yfm<g id="g-7">x</g>';
            const second =
                'Текст <x ctype="code_open" equiv-text="`" id="x-91"/>yfm<g id="g-2">x</g>';

            expect(normalizeUnitIds(first)).toBe(normalizeUnitIds(second));
        });

        it('should keep everything else intact', () => {
            expect(normalizeUnitIds('Обычный текст с id="literal" вне тега')).toBe(
                'Обычный текст с id="literal" вне тега',
            );
        });
    });

    describe('capture requests', () => {
        it('should recover the file and fragments from a real capture prompt', () => {
            // Drift guard: the capture flow relies on the shape of the
            // real prompt builder output for CAPTURE_USER_PROMPT.
            const fragments = ['Первый юнит.', 'Второй юнит\nиз двух строк.'];
            const messages = buildMessages(fragments, {
                ...PROMPT_CONFIG,
                userPrompt: CAPTURE_USER_PROMPT,
            });

            const request = parseCaptureRequest(messages[1].content);

            expect(request.file).toBe('ru/about.md');
            expect(request.fragments).toEqual(fragments);
        });

        it('should recover the file from a title-less context', () => {
            const messages = buildMessages(['Юнит.'], {
                ...PROMPT_CONFIG,
                context: 'file ru/toc.yaml',
                userPrompt: CAPTURE_USER_PROMPT,
            });

            expect(parseCaptureRequest(messages[1].content).file).toBe('ru/toc.yaml');
        });
    });

    describe('buildTranslationMemory', () => {
        const stripLang = (file: string) => file.split('/').slice(1).join('/');

        it('should pair units positionally per file', () => {
            const memory = buildTranslationMemory(
                new Map([['ru/a.md', ['Один', 'Два']]]),
                new Map([['en/a.md', ['One', 'Two']]]),
                stripLang,
            );

            expect(memory.size).toBe(2);
            expect(memory.mismatched).toEqual([]);
            expect(memory.lookup.resolve('Один')).toEqual({text: 'One', hit: true});
        });

        it('should report files with diverging unit counts', () => {
            const memory = buildTranslationMemory(
                new Map([['ru/a.md', ['Один', 'Два']]]),
                new Map([['en/a.md', ['One']]]),
                stripLang,
            );

            expect(memory.size).toBe(0);
            expect(memory.mismatched).toEqual(['a.md (2 source units vs 1 reference units)']);
        });

        it('should match units with different inline ids', () => {
            const memory = buildTranslationMemory(
                new Map([['ru/a.md', ['Код <x id="x-1"/>тут<x id="x-2"/>']]]),
                new Map([['en/a.md', ['Code <x id="x-5"/>here<x id="x-6"/>']]]),
                stripLang,
            );

            expect(memory.lookup.resolve('Код <x id="x-77"/>тут<x id="x-90"/>')).toEqual({
                text: 'Code <x id="x-5"/>here<x id="x-6"/>',
                hit: true,
            });
        });
    });

    describe('translation responses', () => {
        const lookup = makeTmLookup(
            new Map([
                ['Первый юнит.', 'First unit.'],
                ['Второй юнит.', 'Second unit.'],
            ]),
        );

        it('should translate a real default-prompt batch', () => {
            // Drift guard: the mock must survive the real prompt preamble,
            // which mentions the fragment separator and glues itself to
            // the first fragment.
            const messages = buildMessages(['Первый юнит.', 'Второй юнит.'], PROMPT_CONFIG);

            const response = buildTranslateResponse(messages[1].content, lookup);

            expect(response.misses).toEqual([]);
            expect(response.text).toContain('First unit.');
            expect(response.text).toContain('Second unit.');
        });

        it('should echo unknown fragments without the preamble', () => {
            const messages = buildMessages(['Неизвестный юнит.'], PROMPT_CONFIG);

            const response = buildTranslateResponse(messages[1].content, lookup);

            expect(response.misses).toEqual(['Неизвестный юнит.']);
            expect(response.text).toBe('Неизвестный юнит.');
        });

        it('should strip the preamble up to the separator mention', () => {
            const part = 'Intro line with "<<<§§§>>>" inside.\n\nActual fragment.';

            expect(stripPromptPreamble(part)).toBe('Actual fragment.');
        });
    });

    describe('judge responses', () => {
        const lookup = makeTmLookup(new Map([['Один', 'One']]));

        it('should parse pairs from real judge messages', () => {
            const messages = buildJudgeMessages(
                [
                    {path: 'a.md', source: 'Один', translation: 'One'},
                    {path: 'a.md', source: 'Два', translation: 'Two'},
                ],
                'ru',
                'en',
            );

            expect(parseJudgePairs(messages[1].content)).toEqual([
                {index: 1, source: 'Один', translation: 'One'},
                {index: 2, source: 'Два', translation: 'Two'},
            ]);
        });

        it('should produce a response that the real judge parser accepts', () => {
            const messages = buildJudgeMessages(
                [{path: 'a.md', source: 'Один', translation: 'One'}],
                'ru',
                'en',
            );

            const scores = parseJudgeResponse(buildJudgeResponse(messages[1].content, lookup));

            expect(scores).toEqual([{index: 1, score: 100, issue: ''}]);
        });

        it('should score deterministically', () => {
            expect(scoreJudgePair({index: 1, source: 'Один', translation: 'One'}, lookup)).toEqual({
                score: 100,
                issue: '',
            });
            expect(
                scoreJudgePair({index: 1, source: 'Один', translation: 'Один'}, lookup).score,
            ).toBe(10);
            expect(
                scoreJudgePair({index: 1, source: 'Пять', translation: 'Five'}, lookup).score,
            ).toBe(75);
            expect(
                scoreJudgePair({index: 1, source: 'Один', translation: 'Uno'}, lookup).score,
            ).toBeLessThan(100);
        });
    });
});
