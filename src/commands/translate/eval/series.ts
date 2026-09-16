import type {
    EvalReport,
    EvalSeriesJudge,
    EvalSeriesReport,
    EvalSeriesTotals,
    EvalThresholds,
} from './types';

import {MAX_UNSCORED_SHARE} from './report';

export type BuildSeriesReportParams = {
    runs: EvalReport[];
    /**
     * Failures found outside of any single run's thresholds, e.g. a
     * corpus that came back unit-misaligned or a run whose judge report
     * never showed up. Deduplicated on the way in: the same harness
     * hiccup repeating across runs of an otherwise healthy configuration
     * is one finding, not one per run.
     */
    harnessFailures?: string[];
    thresholds: EvalThresholds;
};

/**
 * Aggregates a series of eval runs of one configuration and applies the
 * thresholds to the totals over the series, not to each run.
 *
 * "Every run passes" is a stricter rule than a single run, and a series
 * exists because a single run is not a measurement: in a series of 8
 * real runs of one healthy configuration the same corpus produced 8
 * different results (see
 * docs/specs/2026-09-16-translate-eval-series-design.md). Gating on the
 * total is what turns that noise into a criterion that does not flake on
 * a healthy configuration.
 */
export function buildSeriesReport(params: BuildSeriesReportParams): EvalSeriesReport {
    const {runs, thresholds} = params;

    const totals: EvalSeriesTotals = {
        markup: 0,
        glossary: 0,
        untranslated: 0,
        pages: [],
    };
    const runsByPage = new Map<string, number[]>();

    runs.forEach((run, runIndex) => {
        const runNumber = runIndex + 1;

        for (const page of run.pages) {
            totals.markup += page.markupViolations.length;
            totals.glossary += page.glossaryViolations.length;
            totals.untranslated += page.untranslated?.length || 0;

            const hasDefect =
                page.markupViolations.length > 0 ||
                page.glossaryViolations.length > 0 ||
                (page.untranslated?.length || 0) > 0;

            if (hasDefect) {
                const list = runsByPage.get(page.page) || [];
                list.push(runNumber);
                runsByPage.set(page.page, list);
            }
        }
    });

    totals.pages = Array.from(runsByPage, ([page, pageRuns]) => ({page, runs: pageRuns}));

    const failures = Array.from(new Set(params.harnessFailures || []));

    if (totals.markup > thresholds.maxMarkupViolations) {
        failures.push(
            `markup violations: ${totals.markup} (allowed: ${thresholds.maxMarkupViolations})`,
        );
    }
    if (totals.glossary > thresholds.maxGlossaryViolations) {
        failures.push(
            `glossary violations: ${totals.glossary} (allowed: ${thresholds.maxGlossaryViolations})`,
        );
    }
    if (totals.untranslated > thresholds.maxUntranslated) {
        failures.push(
            `untranslated lines: ${totals.untranslated} (allowed: ${thresholds.maxUntranslated})`,
        );
    }

    const judge = buildSeriesJudge(runs);
    if (judge && thresholds.minJudgeScore > 0) {
        if (judge.scored > 0 && judge.averageScore < thresholds.minJudgeScore) {
            failures.push(
                `judge average score ${judge.averageScore} is below ${thresholds.minJudgeScore}`,
            );
        }
        // Same tolerance as a single run (see MAX_UNSCORED_SHARE in
        // ./report): a rare unscored pair is the judge's own flakiness,
        // not a translation defect, and summing it over the series
        // rather than failing on the worst run keeps one bad pair in one
        // run from sinking an otherwise clean series.
        const sent = judge.scored + judge.skippedPairs;
        if (sent > 0 && judge.skippedPairs / sent > MAX_UNSCORED_SHARE) {
            failures.push(
                `judge left ${judge.skippedPairs} pair(s) of ${sent} unscored ` +
                    `(more than ${MAX_UNSCORED_SHARE * 100}%)`,
            );
        }
    }

    return {
        repeats: runs.length,
        runs,
        totals,
        judge,
        thresholds,
        failures,
        passed: failures.length === 0,
    };
}

/**
 * Weighted average over the runs that carried a judge, weighted by the
 * number of units each run's judge actually scored: a run of 300 scored
 * units should move the series average more than one of 100.
 */
function buildSeriesJudge(runs: EvalReport[]): EvalSeriesJudge | null {
    const judges = runs
        .map((run) => run.judge)
        .filter((judge): judge is NonNullable<typeof judge> => judge !== null);

    if (!judges.length) {
        return null;
    }

    const scored = judges.reduce((sum, judge) => sum + judge.scored, 0);
    const weighted = judges.reduce((sum, judge) => sum + judge.averageScore * judge.scored, 0);
    const averageScore = scored > 0 ? Math.round((weighted / scored) * 10) / 10 : 0;

    return {
        model: judges[0].model,
        threshold: judges[0].threshold,
        scored,
        averageScore,
        low: judges.reduce((sum, judge) => sum + judge.low, 0),
        skippedPairs: judges.reduce((sum, judge) => sum + judge.skippedPairs, 0),
    };
}

function runTotals(run: EvalReport): {markup: number; glossary: number; untranslated: number} {
    return run.pages.reduce(
        (sum, page) => ({
            markup: sum.markup + page.markupViolations.length,
            glossary: sum.glossary + page.glossaryViolations.length,
            untranslated: sum.untranslated + (page.untranslated?.length || 0),
        }),
        {markup: 0, glossary: 0, untranslated: 0},
    );
}

/**
 * Average of a run's page similarities. `null` pages have no reference
 * translation in the corpus and are skipped rather than counted as 0.
 */
function averageSimilarity(run: EvalReport): number | null {
    const values = run.pages
        .map((page) => page.similarity)
        .filter((similarity): similarity is number => similarity !== null);

    if (!values.length) {
        return null;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatRuns(runNumbers: number[]): string {
    return runNumbers.length === 1 ? `run ${runNumbers[0]}` : `runs ${runNumbers.join(', ')}`;
}

/**
 * Renders the scorecard of a series: one line per run for a quick look
 * at the spread, then the totals the verdict is actually computed from.
 *
 * Similarity and the per-run judge average are trend columns, not
 * gates: similarity measures distance from the reference phrasing, not
 * quality, and differs across models with zero defects in both; the
 * judge average is blind to identity units and, on its own, is neither
 * a sufficient nor a stable gate (see the design doc). They stay in the
 * scorecard because a human deciding whether to trust a model change
 * wants the trend even where the verdict does not use it.
 */
export function renderSeries(series: EvalSeriesReport): string {
    const lines: string[] = [];
    const first = series.runs[0];

    lines.push(
        `Translate eval series: ${series.repeats} runs, ${first.mode} mode, ` +
            `model ${first.model}, ${first.sourceLanguage} -> ${first.targetLanguage}`,
        '',
    );

    const header = ['run', 'markup', 'glossary', 'untranslated', 'similarity', 'judge'];
    const rows = series.runs.map((run, index) => {
        const totals = runTotals(run);
        const similarity = averageSimilarity(run);
        return [
            String(index + 1),
            String(totals.markup),
            String(totals.glossary),
            String(totals.untranslated),
            similarity === null ? '-' : similarity.toFixed(3),
            run.judge === null ? '-' : run.judge.averageScore.toFixed(1),
        ];
    });

    const widths = header.map((title, column) =>
        Math.max(title.length, ...rows.map((row) => row[column].length)),
    );
    const render = (row: string[]) =>
        row.map((value, column) => value.padEnd(widths[column])).join('  ');

    lines.push(render(header), ...rows.map(render), '');

    lines.push(
        `Series of ${series.repeats} runs: markup ${series.totals.markup}, ` +
            `glossary ${series.totals.glossary}, untranslated ${series.totals.untranslated} ` +
            `(allowed ${series.thresholds.maxUntranslated})`,
    );

    if (series.judge) {
        lines.push(
            `Judge: ${series.judge.scored} units scored by ${series.judge.model}, ` +
                `average ${series.judge.averageScore.toFixed(1)}/100, ` +
                `${series.judge.low} below threshold ${series.judge.threshold}` +
                (series.judge.skippedPairs ? `, ${series.judge.skippedPairs} unscored` : ''),
        );
    }

    if (series.totals.pages.length) {
        lines.push(
            'Pages with defects: ' +
                series.totals.pages
                    .map((page) => `${page.page} (${formatRuns(page.runs)})`)
                    .join(', '),
        );
    }

    if (series.failures.length) {
        lines.push('', 'Failures:', ...series.failures.map((failure) => `  - ${failure}`));
    }

    lines.push('', `Verdict: ${series.passed ? 'PASS' : 'FAIL'}`);

    return lines.join('\n');
}
