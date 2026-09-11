import type {Spread} from './aggregate';
import type {Verdict} from './pairwise';
import type {BenchReport, CandidateReport} from './report';

const STYLE = `
body {font: 14px/1.5 -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif; margin: 24px; color: #1c1c1c;}
h1 {font-size: 20px; margin-bottom: 4px;}
h2 {font-size: 17px; margin-top: 36px;}
.meta {color: #666; font-size: 13px; margin-bottom: 20px;}
table.summary {border-collapse: collapse; margin-bottom: 8px; font-size: 13px;}
table.summary th, table.summary td {border: 1px solid #ddd; padding: 6px 10px; text-align: right;}
table.summary th {background: #fafafa; font-weight: 600;}
table.summary th:first-child, table.summary td:first-child,
table.summary th:nth-child(2), table.summary td:nth-child(2) {text-align: left;}
table.summary tr.baseline td {background: #f6f6f6;}
.tag {display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 12px; white-space: nowrap;}
.tag.win {background: #e2f4e4; color: #1c6b2a;}
.tag.loss {background: #fae3e3; color: #8c2020;}
.tag.tie {background: #eee; color: #555;}
.tag.weak {background: #fff3cd; color: #7a5c00;}
.segment {border: 1px solid #e5e5e5; border-left-width: 4px; border-radius: 4px; padding: 10px 12px; margin-bottom: 10px;}
.segment.win-candidate {border-left-color: #3aa356;}
.segment.win-baseline {border-left-color: #c94a4a;}
.segment.win-tie {border-left-color: #bbb;}
.segment .head {color: #666; font-size: 12px; margin-bottom: 6px;}
.segment .reason {font-style: italic; color: #444; margin-top: 8px;}
.source {background: #f4f7fb; padding: 8px; border-radius: 3px; white-space: pre-wrap; word-break: break-word; margin-bottom: 8px;}
.texts {display: grid; grid-template-columns: 1fr 1fr; gap: 10px;}
.texts .side {background: #fafafa; padding: 8px; border-radius: 3px; white-space: pre-wrap; word-break: break-word;}
.texts .side .label {display: block; color: #666; font-size: 12px; margin-bottom: 4px;}
`;

/**
 * The corpus is full of raw markup: escaping is what keeps the report
 * both readable and faithful to what the model produced.
 */
export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function summaryCell(value: Spread | null, digits = 2): string {
    if (!value) {
        return '-';
    }

    const mean = value.mean.toFixed(digits);

    return value.min === value.max
        ? mean
        : `${mean} <span class="tag tie">${value.min.toFixed(digits)}..${value.max.toFixed(digits)}</span>`;
}

function winRateCell(candidate: CandidateReport, baseline: string): string {
    if (candidate.name === baseline || !candidate.pairwise) {
        return '-';
    }

    const {winRate, wins, losses, ties, significant} = candidate.pairwise;

    if (winRate === null) {
        return '-';
    }

    return (
        `<span class="tag ${significant ? 'win' : 'weak'}">${(winRate * 100).toFixed(1)}%` +
        `${significant ? '' : ' inconclusive'}</span> ` +
        `<span class="tag tie">${wins}/${losses}/${ties}</span>`
    );
}

/** Decided verdicts first: ties carry no information to look at. */
const ORDER: Record<Verdict['winner'], number> = {candidate: 0, baseline: 1, tie: 2};

function winnerTag(winner: Verdict['winner']): string {
    if (winner === 'candidate') {
        return 'win';
    }

    return winner === 'baseline' ? 'loss' : 'tie';
}

function winnerName(verdict: Verdict, candidateName: string, baselineName: string): string {
    if (verdict.winner === 'tie') {
        return 'tie';
    }

    return verdict.winner === 'candidate' ? candidateName : baselineName;
}

function renderSegment(verdict: Verdict, candidateName: string, baselineName: string): string {
    const winner = winnerName(verdict, candidateName, baselineName);

    return [
        `<div class="segment win-${verdict.winner}">`,
        `<div class="head">${escapeHtml(verdict.page)} #${verdict.index + 1} &middot; ` +
            `<span class="tag ${winnerTag(verdict.winner)}">${escapeHtml(winner)}</span> ` +
            `<span class="tag tie">${escapeHtml(verdict.category)}</span></div>`,
        `<div class="source">${escapeHtml(verdict.source)}</div>`,
        '<div class="texts">',
        `<div class="side"><span class="label">${escapeHtml(baselineName)}</span>${escapeHtml(verdict.baseline)}</div>`,
        `<div class="side"><span class="label">${escapeHtml(candidateName)}</span>${escapeHtml(verdict.candidate)}</div>`,
        '</div>',
        verdict.reason ? `<div class="reason">${escapeHtml(verdict.reason)}</div>` : '',
        '</div>',
    ].join('\n');
}

const HEADER = [
    'candidate',
    'model',
    'markup',
    'glossary',
    'untransl',
    'similarity',
    'judge',
    'struct',
    'win rate vs baseline',
    'tokens in',
    'tokens out',
    'time',
];

function renderRow(candidate: CandidateReport, report: BenchReport): string {
    const cells = [
        escapeHtml(candidate.name) +
            (candidate.name === report.baseline ? ' <span class="tag tie">baseline</span>' : ''),
        escapeHtml(candidate.model),
        summaryCell(candidate.metrics.markup, 1),
        summaryCell(candidate.metrics.glossary, 1),
        summaryCell(candidate.metrics.untranslated, 1),
        summaryCell(candidate.metrics.similarity, 3),
        summaryCell(candidate.metrics.judgeScore, 1),
        summaryCell(candidate.metrics.structuralMismatches, 1),
        winRateCell(candidate, report.baseline),
        summaryCell(candidate.metrics.tokensIn, 0),
        summaryCell(candidate.metrics.tokensOut, 0),
        candidate.metrics.durationMs
            ? `${(candidate.metrics.durationMs.mean / 1000).toFixed(1)}s`
            : '-',
    ];

    const className = candidate.name === report.baseline ? ' class="baseline"' : '';

    return `<tr${className}>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`;
}

function renderComparison(candidate: CandidateReport, report: BenchReport): string {
    const pairwise = candidate.pairwise as NonNullable<CandidateReport['pairwise']>;
    const breakdown = Object.entries(pairwise.byCategory)
        .map(
            ([category, totals]) =>
                `<span class="tag tie">${escapeHtml(category)} ${totals.wins}/${totals.losses}</span>`,
        )
        .join(' ');

    const verdicts = [...pairwise.verdicts].sort(
        (left, right) => ORDER[left.winner] - ORDER[right.winner],
    );

    return [
        `<h2>${escapeHtml(candidate.name)} vs ${escapeHtml(report.baseline)}</h2>`,
        `<p class="meta">${pairwise.judged} pair(s) judged, ${pairwise.identical} identical, ` +
            `${pairwise.unparsed} unscored, p=${pairwise.pValue.toFixed(4)}` +
            `${pairwise.significant ? '' : ' (inconclusive)'}<br>wins/losses: ${breakdown}</p>`,
        ...verdicts.map((verdict) => renderSegment(verdict, candidate.name, report.baseline)),
    ].join('\n');
}

/**
 * Renders the whole benchmark as one self-contained HTML file: no
 * external assets, no scripts, nothing to serve. A pure function of the
 * report, so a saved JSON report can be re-rendered later.
 */
export function renderBenchHtml(report: BenchReport): string {
    const comparisons = report.candidates
        .filter((candidate) => candidate.name !== report.baseline && candidate.pairwise)
        .map((candidate) => renderComparison(candidate, report));

    return [
        '<!doctype html>',
        '<html lang="en"><head><meta charset="utf-8">',
        '<title>Translate model benchmark</title>',
        `<style>${STYLE}</style>`,
        '</head><body>',
        '<h1>Translate model benchmark</h1>',
        `<p class="meta">${escapeHtml(report.sourceLanguage)} &rarr; ${escapeHtml(report.targetLanguage)} &middot; ` +
            `baseline <b>${escapeHtml(report.baseline)}</b> &middot; ${report.repeats} repeat(s) &middot; ` +
            `seed ${escapeHtml(report.seed)}<br>corpus ${escapeHtml(report.corpus)}<br>` +
            `${escapeHtml(report.startedAt)} &ndash; ${escapeHtml(report.finishedAt)}</p>`,
        '<table class="summary">',
        `<tr>${HEADER.map((title) => `<th>${title}</th>`).join('')}</tr>`,
        ...report.candidates.map((candidate) => renderRow(candidate, report)),
        '</table>',
        ...comparisons,
        '</body></html>',
        '',
    ].join('\n');
}
