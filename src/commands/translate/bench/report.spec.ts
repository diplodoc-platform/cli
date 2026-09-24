import type {BenchReport, CandidateMetrics} from './report';

import {describe, expect, it} from 'vitest';

import {renderBenchTable} from './report';

const metrics = (over: Partial<CandidateMetrics> = {}): CandidateMetrics => ({
    markup: {mean: 0, min: 0, max: 0},
    glossary: {mean: 0, min: 0, max: 0},
    untranslated: {mean: 0, min: 0, max: 0},
    similarity: {mean: 0.82, min: 0.81, max: 0.83},
    judgeScore: {mean: 91, min: 90, max: 92},
    tokensIn: {mean: 5000, min: 5000, max: 5000},
    tokensOut: {mean: 4800, min: 4700, max: 4900},
    durationMs: {mean: 60000, min: 59000, max: 61000},
    structuralMismatches: {mean: 0, min: 0, max: 0},
    errors: {mean: 0, min: 0, max: 0},
    ...over,
});

const report = (): BenchReport => ({
    schemaVersion: 1,
    startedAt: '2026-09-11T10:00:00.000Z',
    finishedAt: '2026-09-11T10:30:00.000Z',
    corpus: '/corpus',
    sourceLanguage: 'ru-RU',
    targetLanguage: 'en-US',
    baseline: 'current',
    repeats: 2,
    seed: 'default',
    candidates: [
        {
            name: 'current',
            model: 'model-a',
            provider: 'openai',
            runs: [],
            metrics: metrics(),
            pairwise: null,
        },
        {
            name: 'glm',
            model: 'model-b',
            provider: 'openai',
            runs: [],
            metrics: metrics({
                markup: {mean: 1, min: 0, max: 2},
                untranslated: null,
                similarity: null,
                judgeScore: {mean: 93, min: 92, max: 94},
            }),
            pairwise: {
                judged: 120,
                identical: 200,
                unparsed: 0,
                wins: 70,
                losses: 40,
                ties: 10,
                winRate: 0.625,
                byCategory: {
                    accuracy: {wins: 30, losses: 20},
                    terminology: {wins: 10, losses: 15},
                    style: {wins: 28, losses: 4},
                    markup: {wins: 2, losses: 1},
                },
                pValue: 0.0047,
                significant: true,
                verdicts: [],
            },
        },
    ],
});

describe('renderBenchTable', () => {
    it('should mark the baseline row and render the win rate of the others', () => {
        const table = renderBenchTable(report());

        expect(table).toContain('current (baseline)');
        expect(table).toContain('70/40/10');
        expect(table).toContain('62.5%');
    });

    it('should render unavailable metrics as a dash, not as zero', () => {
        const table = renderBenchTable(report());
        const glmRow = table.split('\n').find((line) => line.startsWith('glm')) as string;

        expect(glmRow).toContain('-');
        expect(glmRow).not.toContain('0.000');
    });

    it('should show the spread of a metric that varied between repeats', () => {
        const table = renderBenchTable(report());
        const glmRow = table.split('\n').find((line) => line.startsWith('glm')) as string;

        expect(glmRow).toContain('1.0 (0.0..2.0)');
    });

    it('should flag an inconclusive comparison', () => {
        const data = report();
        const pairwise = data.candidates[1].pairwise as NonNullable<
            (typeof data.candidates)[1]['pairwise']
        >;
        pairwise.significant = false;

        expect(renderBenchTable(data)).toContain('inconclusive');
    });

    it('should show the category breakdown under the table', () => {
        const table = renderBenchTable(report());

        expect(table).toContain('style 28/4');
        expect(table).toContain('terminology 10/15');
    });
});
