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

    it('should report no judge and render no Judge line when no run carries a judge report', () => {
        const series = buildSeriesReport({
            runs: [run({judge: null}), run({judge: null})],
            thresholds: DEFAULT_THRESHOLDS,
        });

        expect(series.judge).toBeNull();

        const rendered = renderSeries(series);

        expect(rendered).not.toContain('Judge:');
    });

    it('should fail and render the Failures block when markup or glossary violations exceed the series budget', () => {
        const series = buildSeriesReport({
            runs: [
                run({
                    pages: [
                        page({
                            markupViolations: [{type: 'fence-content', detail: 'diverged'}],
                            glossaryViolations: [
                                {
                                    sourceText: 'заметка',
                                    translatedText: 'memo',
                                    sourceOccurrences: 1,
                                },
                            ],
                        }),
                    ],
                }),
            ],
            thresholds: DEFAULT_THRESHOLDS,
        });

        expect(series.passed).toBe(false);
        expect(series.failures).toEqual([
            'markup violations: 1 (allowed: 0)',
            'glossary violations: 1 (allowed: 0)',
        ]);

        const rendered = renderSeries(series);

        expect(rendered).toContain('Failures:');
        expect(rendered).toContain('  - markup violations: 1 (allowed: 0)');
        expect(rendered).toContain('  - glossary violations: 1 (allowed: 0)');
        expect(rendered).toContain('Verdict: FAIL');
    });

    it('should fail when the weighted judge average is below the threshold', () => {
        const series = buildSeriesReport({
            runs: [run({judge: judge({scored: 10, averageScore: 50})})],
            thresholds: DEFAULT_THRESHOLDS,
        });

        expect(series.passed).toBe(false);
        expect(series.failures).toEqual(['judge average score 50 is below 70']);
    });

    it('should fail when the judge leaves too many pairs unscored', () => {
        const series = buildSeriesReport({
            runs: [run({judge: judge({scored: 10, skippedPairs: 1, averageScore: 99})})],
            thresholds: DEFAULT_THRESHOLDS,
        });

        expect(series.passed).toBe(false);
        expect(series.failures).toEqual(['judge left 1 pair(s) of 11 unscored (more than 5%)']);
    });

    it('should render the Judge line and the per-run judge column when the series carries a judge', () => {
        const series = buildSeriesReport({
            runs: [
                run({judge: judge({scored: 100, averageScore: 90, low: 1, skippedPairs: 0})}),
                run({judge: judge({scored: 100, averageScore: 95, low: 0, skippedPairs: 2})}),
            ],
            thresholds: DEFAULT_THRESHOLDS,
        });

        expect(series.passed).toBe(true);

        const rendered = renderSeries(series);

        expect(rendered).toContain(
            'Judge: 200 units scored by eval-mock, average 92.5/100, 1 below threshold 70, 2 unscored',
        );
        expect(rendered).toContain('90.0');
        expect(rendered).toContain('95.0');
    });

    it('should omit the unscored count from the Judge line when nothing was skipped', () => {
        const series = buildSeriesReport({
            runs: [run({judge: judge({scored: 10, averageScore: 90, skippedPairs: 0})})],
            thresholds: DEFAULT_THRESHOLDS,
        });

        const rendered = renderSeries(series);

        expect(rendered).toContain(
            'Judge: 10 units scored by eval-mock, average 90.0/100, 0 below threshold 70',
        );
        expect(rendered).not.toContain('unscored');
    });

    it('should default the weighted judge average to 0 instead of NaN when no units were scored', () => {
        const series = buildSeriesReport({
            runs: [run({judge: judge({scored: 0, averageScore: 90, skippedPairs: 0})})],
            thresholds: DEFAULT_THRESHOLDS,
        });

        expect(series.judge?.averageScore).toBe(0);
        expect(series.passed).toBe(true);

        const rendered = renderSeries(series);

        expect(rendered).not.toContain('NaN');
    });

    it('should list the run numbers together when a page is defective in more than one run', () => {
        const series = buildSeriesReport({
            runs: [
                run({pages: [page({untranslated: [{line: 1, text: 'x'}]})]}),
                run({pages: [page()]}),
                run({pages: [page({untranslated: [{line: 1, text: 'y'}]})]}),
            ],
            thresholds: {...DEFAULT_THRESHOLDS, maxUntranslated: 2},
        });

        expect(series.passed).toBe(true);
        expect(series.totals.pages).toEqual([{page: 'about.md', runs: [1, 3]}]);

        const rendered = renderSeries(series);

        expect(rendered).toContain('about.md (runs 1, 3)');
    });

    it('should keep the similarity column readable when a run has no page with a reference translation', () => {
        const series = buildSeriesReport({
            runs: [run({pages: [page({similarity: null})]})],
            thresholds: DEFAULT_THRESHOLDS,
        });

        const rendered = renderSeries(series);

        expect(rendered).not.toContain('NaN');
        expect(rendered).toMatch(/^1\s+0\s+0\s+0\s+-\s+-\s*$/m);
    });
});
