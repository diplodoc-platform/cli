import type {EvalReport, EvalThresholds, JudgeSummary, PageResult} from './types';

export const DEFAULT_THRESHOLDS: EvalThresholds = {
    maxMarkupViolations: 0,
    maxGlossaryViolations: 0,
    maxUntranslated: 0,
    minJudgeScore: 70,
    minSimilarity: 0,
};

export type BuildReportParams = {
    corpus: string;
    sourceLanguage: string;
    targetLanguage: string;
    mode: 'mock' | 'real';
    model: string;
    pages: PageResult[];
    judge: JudgeSummary | null;
    thresholds: EvalThresholds;
    /** Extra failures detected by the runner, e.g. translation memory misses. */
    extraFailures?: string[];
};

/**
 * Applies thresholds to per-page results and assembles the final
 * report with an overall verdict.
 */
export function buildReport(params: BuildReportParams): EvalReport {
    const {pages, judge, thresholds} = params;
    const failures: string[] = [...(params.extraFailures || [])];

    const totals = {
        markup: 0,
        glossary: 0,
        untranslated: 0,
    };

    for (const page of pages) {
        totals.markup += page.markupViolations.length;
        totals.glossary += page.glossaryViolations.length;
        totals.untranslated += page.untranslated.length;

        if (thresholds.minSimilarity > 0 && page.similarity < thresholds.minSimilarity) {
            failures.push(
                `${page.page}: similarity ${page.similarity} is below ${thresholds.minSimilarity}`,
            );
        }
    }

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

    if (judge && thresholds.minJudgeScore > 0 && judge.scored > 0) {
        if (judge.averageScore < thresholds.minJudgeScore) {
            failures.push(
                `judge average score ${judge.averageScore} is below ${thresholds.minJudgeScore}`,
            );
        }
    }

    return {
        corpus: params.corpus,
        sourceLanguage: params.sourceLanguage,
        targetLanguage: params.targetLanguage,
        mode: params.mode,
        model: params.model,
        pages,
        judge,
        thresholds,
        failures,
        passed: failures.length === 0,
    };
}

function cell(value: number, suffix = ''): string {
    return value === 0 ? 'ok' : String(value) + suffix;
}

/**
 * Renders the human-readable scorecard.
 */
export function renderReport(report: EvalReport): string {
    const lines: string[] = [];

    lines.push(
        `Translate eval: ${report.mode} mode, model ${report.model}, ` +
            `${report.sourceLanguage} -> ${report.targetLanguage}`,
        `Corpus: ${report.corpus} (${report.pages.length} pages)`,
        '',
    );

    const header = ['page', 'markup', 'glossary', 'untranslated', 'similarity', 'judge<t'];
    const rows = report.pages.map((page) => [
        page.page,
        cell(page.markupViolations.length),
        cell(page.glossaryViolations.length),
        cell(page.untranslated.length),
        page.similarity.toFixed(3),
        cell(page.judgeLow),
    ]);

    const widths = header.map((title, column) =>
        Math.max(title.length, ...rows.map((row) => row[column].length)),
    );
    const render = (row: string[]) =>
        row.map((value, column) => value.padEnd(widths[column])).join('  ');

    lines.push(render(header), ...rows.map(render), '');

    for (const page of report.pages) {
        const details = [
            ...page.markupViolations.map((violation) => `[${violation.type}] ${violation.detail}`),
            ...page.glossaryViolations.map(
                (violation) =>
                    `[glossary] "${violation.sourceText}" must be translated as ` +
                    `"${violation.translatedText}" (${violation.sourceOccurrences} occurrence(s))`,
            ),
            ...page.untranslated.map((line) => `[untranslated] line ${line.line}: ${line.text}`),
        ];
        if (details.length) {
            lines.push(`${page.page}:`, ...details.map((detail) => `  ${detail}`), '');
        }
    }

    if (report.judge) {
        lines.push(
            `Judge: ${report.judge.scored} units scored by ${report.judge.model}, ` +
                `average ${report.judge.averageScore}/100, ` +
                `${report.judge.low} below threshold ${report.judge.threshold}` +
                (report.judge.skippedPairs ? `, ${report.judge.skippedPairs} unscored` : ''),
        );
    } else {
        lines.push('Judge: skipped');
    }

    if (report.failures.length) {
        lines.push('', 'Failures:', ...report.failures.map((failure) => `  - ${failure}`));
    }

    lines.push('', `Verdict: ${report.passed ? 'PASS' : 'FAIL'}`);

    return lines.join('\n');
}
