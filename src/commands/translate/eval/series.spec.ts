import type {EvalReport, JudgeSummary, PageResult} from './types';

import {describe, expect, it} from 'vitest';

import {DEFAULT_THRESHOLDS} from './report';
import {buildSeriesReport, renderSeries} from './series';

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

function judge(overrides: Partial<JudgeSummary> = {}): JudgeSummary {
    return {
        model: 'eval-mock',
        threshold: 70,
        scored: 10,
        averageScore: 98,
        low: 0,
        skippedPairs: 0,
        ...overrides,
    };
}

function run(overrides: Partial<EvalReport> = {}): EvalReport {
    return {
        corpus: '/corpus',
        sourceLanguage: 'ru-RU',
        targetLanguage: 'en-US',
        mode: 'mock',
        model: 'eval-mock',
        pages: [page()],
        judge: null,
        thresholds: DEFAULT_THRESHOLDS,
        failures: [],
        passed: true,
        ...overrides,
    };
}

describe('translate eval series report', () => {
    it('should sum untranslated lines over the series and fail on the total', () => {
        const series = buildSeriesReport({
            runs: [
                run({pages: [page({untranslated: [{line: 1, text: 'x'}]})]}),
                run({pages: [page({untranslated: []})]}),
                run({pages: [page({untranslated: [{line: 1, text: 'y'}]})]}),
            ],
            thresholds: {...DEFAULT_THRESHOLDS, maxUntranslated: 1},
        });

        expect(series.passed).toBe(false);
        expect(series.failures).toEqual(['untranslated lines: 2 (allowed: 1)']);
    });

    it('should pass when the total fits the budget even though one run has a defect', () => {
        const series = buildSeriesReport({
            runs: [
                run({pages: [page({untranslated: [{line: 1, text: 'x'}]})]}),
                run({pages: [page({untranslated: []})]}),
                run({pages: [page({untranslated: []})]}),
            ],
            thresholds: {...DEFAULT_THRESHOLDS, maxUntranslated: 1},
        });

        expect(series.passed).toBe(true);
        expect(series.failures).toEqual([]);
        expect(series.totals.pages).toEqual([{page: 'about.md', runs: [1]}]);
    });

    it('should weight the judge average by the scored units of each run', () => {
        const series = buildSeriesReport({
            runs: [
                run({judge: judge({scored: 100, averageScore: 90, low: 1, skippedPairs: 1})}),
                run({judge: judge({scored: 300, averageScore: 100, low: 2, skippedPairs: 2})}),
            ],
            thresholds: DEFAULT_THRESHOLDS,
        });

        expect(series.judge).toEqual({
            model: 'eval-mock',
            threshold: 70,
            scored: 400,
            averageScore: 97.5,
            low: 3,
            skippedPairs: 3,
        });
        expect(series.passed).toBe(true);
    });

    it('should keep harness failures of the runs but deduplicate repeats', () => {
        const series = buildSeriesReport({
            runs: [run(), run()],
            harnessFailures: ['judge report was not produced', 'judge report was not produced'],
            thresholds: DEFAULT_THRESHOLDS,
        });

        expect(series.failures).toEqual(['judge report was not produced']);
        expect(series.passed).toBe(false);
    });

    it('should render a line per run, the series header, defect pages and the verdict', () => {
        const rendered = renderSeries(
            buildSeriesReport({
                runs: [
                    run({pages: [page({untranslated: [{line: 1, text: 'x'}]})]}),
                    run({pages: [page({untranslated: []})]}),
                ],
                thresholds: {...DEFAULT_THRESHOLDS, maxUntranslated: 1},
            }),
        );

        expect(rendered).toContain('Series of 2 runs');
        expect(rendered).toContain('about.md (run 1)');
        expect(rendered).toContain('Verdict: PASS');
    });
});
