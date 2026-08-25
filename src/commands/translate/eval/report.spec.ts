import type {PageResult} from './types';

import {describe, expect, it} from 'vitest';

import {DEFAULT_THRESHOLDS, buildReport, renderReport} from './report';

function page(overrides: Partial<PageResult> = {}): PageResult {
    return {
        page: 'about.md',
        markupViolations: [],
        glossaryViolations: [],
        untranslated: [],
        similarity: 1,
        judgeLow: 0,
        ...overrides,
    };
}

function report(pages: PageResult[], overrides = {}) {
    return buildReport({
        corpus: '/corpus',
        sourceLanguage: 'ru-RU',
        targetLanguage: 'en-US',
        mode: 'mock',
        model: 'eval-mock',
        pages,
        judge: {
            model: 'eval-mock',
            threshold: 70,
            scored: 10,
            averageScore: 98,
            low: 0,
            skippedPairs: 0,
        },
        thresholds: DEFAULT_THRESHOLDS,
        ...overrides,
    });
}

describe('translate eval report', () => {
    it('should pass a clean run', () => {
        const result = report([page()]);

        expect(result.passed).toBe(true);
        expect(result.failures).toEqual([]);
    });

    it('should fail on markup, glossary and untranslated totals', () => {
        const result = report([
            page({
                markupViolations: [{type: 'links', detail: 'x'}],
                glossaryViolations: [{sourceText: 'а', translatedText: 'a', sourceOccurrences: 1}],
                untranslated: [{line: 1, text: 'х'}],
            }),
        ]);

        expect(result.passed).toBe(false);
        expect(result.failures).toEqual([
            'markup violations: 1 (allowed: 0)',
            'glossary violations: 1 (allowed: 0)',
            'untranslated lines: 1 (allowed: 0)',
        ]);
    });

    it('should fail on a low judge average', () => {
        const result = report([page()], {
            judge: {
                model: 'eval-mock',
                threshold: 70,
                scored: 10,
                averageScore: 42,
                low: 5,
                skippedPairs: 0,
            },
        });

        expect(result.passed).toBe(false);
        expect(result.failures).toEqual(['judge average score 42 is below 70']);
    });

    it('should fail on unscored judge pairs', () => {
        const result = report([page()], {
            judge: {
                model: 'eval-mock',
                threshold: 70,
                scored: 8,
                averageScore: 95,
                low: 0,
                skippedPairs: 2,
            },
        });

        expect(result.passed).toBe(false);
        expect(result.failures).toEqual(['judge left 2 pair(s) unscored']);
    });

    it('should gate similarity only when the threshold is set', () => {
        const low = page({similarity: 0.4});

        expect(report([low]).passed).toBe(true);
        expect(
            report([low], {thresholds: {...DEFAULT_THRESHOLDS, minSimilarity: 0.8}}).failures,
        ).toEqual(['about.md: similarity 0.4 is below 0.8']);
    });

    it('should carry extra failures from the runner', () => {
        const result = report([page()], {extraFailures: ['translation memory misses: 3']});

        expect(result.passed).toBe(false);
        expect(result.failures).toEqual(['translation memory misses: 3']);
    });

    it('should render the scorecard with per-page details and a verdict', () => {
        const rendered = renderReport(
            report([
                page(),
                page({
                    page: 'syntax/links.md',
                    markupViolations: [{type: 'links', detail: 'link targets diverge'}],
                }),
            ]),
        );

        expect(rendered).toContain('about.md');
        expect(rendered).toContain('syntax/links.md:');
        expect(rendered).toContain('[links] link targets diverge');
        expect(rendered).toContain('Verdict: FAIL');
        expect(rendered).toContain('Judge: 10 units scored');
    });
});
