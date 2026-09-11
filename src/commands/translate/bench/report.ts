import type {PairwiseSummary, Spread} from './aggregate';
import type {Verdict} from './pairwise';

export const BENCH_SCHEMA_VERSION = 1;

export type RunArtifacts = {
    repeat: number;
    workdir: string;
    evalReport: string;
    runReport: string | null;
    /** Threshold failures of the eval run, kept for context. */
    failures: string[];
};

export type CandidateMetrics = {
    markup: Spread | null;
    glossary: Spread | null;
    untranslated: Spread | null;
    similarity: Spread | null;
    judgeScore: Spread | null;
    tokensIn: Spread | null;
    tokensOut: Spread | null;
    durationMs: Spread | null;
    structuralMismatches: Spread | null;
    errors: Spread | null;
};

export type CandidatePairwise = PairwiseSummary & {
    /** Every verdict with the texts it judged; the HTML renders these. */
    verdicts: Verdict[];
};

export type CandidateReport = {
    name: string;
    provider: string;
    model: string;
    runs: RunArtifacts[];
    metrics: CandidateMetrics;
    /** Null for the baseline itself. */
    pairwise: CandidatePairwise | null;
};

export type BenchReport = {
    schemaVersion: number;
    startedAt: string;
    finishedAt: string;
    corpus: string;
    sourceLanguage: string;
    targetLanguage: string;
    baseline: string;
    repeats: number;
    seed: string;
    candidates: CandidateReport[];
};

function number(value: Spread | null, digits = 0): string {
    if (!value) {
        return '-';
    }

    const mean = value.mean.toFixed(digits);

    return value.min === value.max
        ? mean
        : `${mean} (${value.min.toFixed(digits)}..${value.max.toFixed(digits)})`;
}

function seconds(value: Spread | null): string {
    return value ? `${(value.mean / 1000).toFixed(1)}s` : '-';
}

function tokens(value: Spread | null): string {
    return value ? Math.round(value.mean).toLocaleString('en-US') : '-';
}

function pairwiseCells(candidate: CandidateReport, baseline: string): [string, string] {
    if (candidate.name === baseline || !candidate.pairwise) {
        return ['-', '-'];
    }

    const {wins, losses, ties, winRate, significant} = candidate.pairwise;

    if (winRate === null) {
        return ['-', '-'];
    }

    return [
        `${wins}/${losses}/${ties}`,
        `${(winRate * 100).toFixed(1)}%${significant ? '' : ' (inconclusive)'}`,
    ];
}

function renderRows(rows: string[][]): string[] {
    const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));

    return rows.map((row) => row.map((value, column) => value.padEnd(widths[column])).join('  '));
}

/**
 * Renders the scorecard: one row per candidate, the baseline marked.
 * Metrics that could not be measured render as `-` rather than as 0,
 * which would read as a perfect score.
 */
export function renderBenchTable(report: BenchReport): string {
    const lines: string[] = [
        `Translate bench: ${report.sourceLanguage} -> ${report.targetLanguage}, ` +
            `baseline ${report.baseline}, ${report.repeats} repeat(s), seed ${report.seed}`,
        `Corpus: ${report.corpus}`,
        '',
    ];

    const header = [
        'candidate',
        'markup',
        'glossary',
        'untransl',
        'similarity',
        'judge',
        'struct',
        'W/L/T',
        'win rate',
        'tokens in',
        'tokens out',
        'time',
    ];

    const rows = report.candidates.map((candidate) => {
        const [record, rate] = pairwiseCells(candidate, report.baseline);

        return [
            candidate.name === report.baseline ? `${candidate.name} (baseline)` : candidate.name,
            number(candidate.metrics.markup, 1),
            number(candidate.metrics.glossary, 1),
            number(candidate.metrics.untranslated, 1),
            candidate.metrics.similarity ? candidate.metrics.similarity.mean.toFixed(3) : '-',
            number(candidate.metrics.judgeScore, 1),
            number(candidate.metrics.structuralMismatches, 1),
            record,
            rate,
            tokens(candidate.metrics.tokensIn),
            tokens(candidate.metrics.tokensOut),
            seconds(candidate.metrics.durationMs),
        ];
    });

    lines.push(...renderRows([header, ...rows]), '');

    for (const candidate of report.candidates) {
        if (!candidate.pairwise || candidate.name === report.baseline) {
            continue;
        }

        const {byCategory, judged, identical, unparsed, pValue} = candidate.pairwise;
        const breakdown = Object.entries(byCategory)
            .map(([category, totals]) => `${category} ${totals.wins}/${totals.losses}`)
            .join(', ');

        lines.push(
            `${candidate.name} vs ${report.baseline}: ${judged} pair(s) judged, ` +
                `${identical} identical, ${unparsed} unscored, p=${pValue.toFixed(4)}`,
            `  wins/losses by category: ${breakdown}`,
            '',
        );
    }

    return lines.join('\n');
}
