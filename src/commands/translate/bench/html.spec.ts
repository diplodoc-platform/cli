import type {BenchReport, CandidateMetrics} from './report';

import {describe, expect, it} from 'vitest';

import {renderBenchHtml} from './html';

const metrics = (): CandidateMetrics => ({
    markup: {mean: 0, min: 0, max: 0},
    glossary: null,
    untranslated: null,
    similarity: null,
    judgeScore: null,
    tokensIn: null,
    tokensOut: null,
    durationMs: null,
    structuralMismatches: null,
    errors: null,
});

const report = (): BenchReport => ({
    schemaVersion: 1,
    startedAt: '2026-09-11T10:00:00.000Z',
    finishedAt: '2026-09-11T10:30:00.000Z',
    corpus: '/corpus',
    sourceLanguage: 'ru-RU',
    targetLanguage: 'en-US',
    baseline: 'current',
    repeats: 1,
    seed: 'default',
    candidates: [
        {
            name: 'current',
            provider: 'openai',
            model: 'model-a',
            runs: [],
            metrics: metrics(),
            pairwise: null,
        },
        {
            name: 'glm',
            provider: 'openai',
            model: 'model-b',
            runs: [],
            metrics: metrics(),
            pairwise: {
                judged: 2,
                identical: 5,
                unparsed: 0,
                wins: 1,
                losses: 1,
                ties: 0,
                winRate: 0.5,
                byCategory: {
                    accuracy: {wins: 1, losses: 0},
                    terminology: {wins: 0, losses: 1},
                    style: {wins: 0, losses: 0},
                    markup: {wins: 0, losses: 0},
                },
                pValue: 1,
                significant: false,
                verdicts: [
                    {
                        page: 'about.md',
                        index: 0,
                        winner: 'candidate',
                        category: 'accuracy',
                        reason: 'closer to the source',
                        source: 'Тег <b> и символ &',
                        baseline: 'Tag <b> and symbol &',
                        candidate: 'The <b> tag and the & symbol',
                    },
                    {
                        page: 'about.md',
                        index: 1,
                        winner: 'baseline',
                        category: 'terminology',
                        reason: 'wrong term',
                        source: 'Сборка',
                        baseline: 'Build',
                        candidate: 'Assembly',
                    },
                ],
            },
        },
    ],
});

describe('renderBenchHtml', () => {
    it('should produce a self-contained document', () => {
        const html = renderBenchHtml(report());

        expect(html.startsWith('<!doctype html>')).toBe(true);
        expect(html).toContain('<style>');
        expect(html).not.toMatch(/<script|<link/);
    });

    it('should escape markup coming from the corpus', () => {
        const html = renderBenchHtml(report());

        expect(html).toContain('Tag &lt;b&gt; and symbol &amp;');
        expect(html).not.toContain('Tag <b> and symbol &');
    });

    it('should show the summary table and both candidates', () => {
        const html = renderBenchHtml(report());

        expect(html).toContain('current');
        expect(html).toContain('glm');
        expect(html).toContain('50.0%');
        expect(html).toContain('inconclusive');
    });

    it('should render each verdict with its reason and mark the winner', () => {
        const html = renderBenchHtml(report());

        expect(html).toContain('closer to the source');
        expect(html).toContain('wrong term');
        expect(html).toContain('win-candidate');
        expect(html).toContain('win-baseline');
    });

    it('should order decided verdicts before ties', () => {
        const data = report();
        const pairwise = data.candidates[1].pairwise as NonNullable<
            (typeof data.candidates)[1]['pairwise']
        >;
        pairwise.verdicts = [
            {...pairwise.verdicts[0], winner: 'tie', reason: 'equal'},
            pairwise.verdicts[1],
        ];

        const html = renderBenchHtml(data);

        expect(html.indexOf('wrong term')).toBeLessThan(html.indexOf('equal'));
    });

    it('should render a candidate without pairwise data', () => {
        const data = report();
        data.candidates[1].pairwise = null;

        const html = renderBenchHtml(data);

        expect(html).toContain('glm');
        expect(html).not.toContain('<h2>');
    });
});
