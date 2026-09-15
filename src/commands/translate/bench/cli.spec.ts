import type {RunOutcome} from './cli';
import type {EvalReport, PageResult} from '../eval/types';

import {describe, expect, it} from 'vitest';

import {collectMetrics, parseArgs, renderPlan} from './cli';

const page = (over: Partial<PageResult> = {}): PageResult => ({
    page: 'a.md',
    markupViolations: [],
    glossaryViolations: [],
    untranslated: [],
    similarity: 0.8,
    judgeLow: 0,
    ...over,
});

const evalReport = (over: Partial<EvalReport> = {}): EvalReport =>
    ({
        pages: [page()],
        judge: {
            model: 'm',
            threshold: 70,
            scored: 10,
            averageScore: 90,
            low: 0,
            skippedPairs: 0,
        },
        ...over,
    }) as EvalReport;

const outcome = (over: Partial<RunOutcome> = {}): RunOutcome => ({
    report: evalReport(),
    runReport: {durationMs: 1000, totals: {tokens: {input: 100, output: 200}}, errors: []},
    structuralMismatches: 0,
    ...over,
});

describe('parseArgs', () => {
    it('should apply defaults', () => {
        expect(parseArgs(['--candidates', 'bench.yaml'])).toMatchObject({
            candidates: 'bench.yaml',
            repeats: 1,
            seed: 'default',
            source: 'ru-RU',
            target: 'en-US',
            judge: true,
            pairwise: true,
            dryRun: false,
        });
    });

    it('should parse the flags that cost money', () => {
        const args = parseArgs([
            '--candidates',
            'bench.yaml',
            '--repeats',
            '3',
            '--max-pairs',
            '50',
            '--no-pairwise',
            '--dry-run',
        ]);

        expect(args.repeats).toBe(3);
        expect(args.maxPairs).toBe(50);
        expect(args.pairwise).toBe(false);
        expect(args.dryRun).toBe(true);
    });

    it('should take the report paths', () => {
        const args = parseArgs([
            '--candidates',
            'bench.yaml',
            '--report',
            'out.json',
            '--html',
            'out.html',
        ]);

        expect(args.report).toBe('out.json');
        expect(args.html).toBe('out.html');
    });

    it('should require a candidates file', () => {
        expect(() => parseArgs([])).toThrow(/--candidates/);
    });

    it('should reject a non-positive repeat count', () => {
        expect(() => parseArgs(['--candidates', 'bench.yaml', '--repeats', '0'])).toThrow(
            /--repeats/,
        );
    });

    it('should reject an unknown option', () => {
        expect(() => parseArgs(['--candidates', 'bench.yaml', '--nope'])).toThrow(/Unknown option/);
    });
});

describe('renderPlan', () => {
    it('should list the runs and the environment variables it will read', () => {
        const plan = renderPlan({
            candidates: [
                {name: 'current', provider: 'openai', model: 'a', authEnv: 'A_KEY'},
                {name: 'glm', provider: 'openai', model: 'b', authEnv: 'B_KEY'},
            ],
            baseline: 'current',
            judge: {model: 'j', apiBase: 'https://j/v1', authEnv: 'JUDGE_KEY'},
            repeats: 2,
            pages: 20,
        });

        expect(plan).toContain('4 translate run(s) over 20 page(s)');
        expect(plan).toContain('A_KEY, B_KEY, JUDGE_KEY');
    });

    it('should say when no judge is configured', () => {
        const plan = renderPlan({
            candidates: [
                {name: 'current', provider: 'openai'},
                {name: 'glm', provider: 'openai'},
            ],
            baseline: 'current',
            judge: null,
            repeats: 1,
            pages: 1,
        });

        expect(plan).toContain('pairwise judge: not configured');
        expect(plan).toContain('environment variables: none');
    });
});

describe('collectMetrics', () => {
    it('should average the eval reports and the run reports of the repeats', () => {
        const metrics = collectMetrics([
            outcome({
                report: evalReport({pages: [page({markupViolations: [{type: 'x', detail: 'y'}]})]}),
            }),
            outcome({
                report: evalReport({
                    pages: [page({similarity: 0.9})],
                    judge: {
                        model: 'm',
                        threshold: 70,
                        scored: 10,
                        averageScore: 94,
                        low: 0,
                        skippedPairs: 0,
                    },
                }),
                runReport: {
                    durationMs: 3000,
                    totals: {tokens: {input: 200, output: 300}},
                    errors: [],
                },
                structuralMismatches: 2,
            }),
        ]);

        expect(metrics.markup).toEqual({mean: 0.5, min: 0, max: 1});
        expect(metrics.similarity?.mean).toBeCloseTo(0.85, 10);
        expect(metrics.similarity).toMatchObject({min: 0.8, max: 0.9});
        expect(metrics.judgeScore).toEqual({mean: 92, min: 90, max: 94});
        expect(metrics.durationMs).toEqual({mean: 2000, min: 1000, max: 3000});
        expect(metrics.tokensIn).toEqual({mean: 150, min: 100, max: 200});
        expect(metrics.structuralMismatches).toEqual({mean: 1, min: 0, max: 2});
    });

    it('should report metrics as unavailable when the corpus has no references', () => {
        const metrics = collectMetrics([
            outcome({
                report: evalReport({
                    pages: [page({similarity: null, untranslated: null})],
                    judge: null,
                }),
                runReport: null,
            }),
        ]);

        expect(metrics.similarity).toBeNull();
        expect(metrics.untranslated).toBeNull();
        expect(metrics.judgeScore).toBeNull();
        expect(metrics.tokensIn).toBeNull();
        expect(metrics.durationMs).toBeNull();
    });

    it('should drop a metric that one repeat failed to produce', () => {
        const metrics = collectMetrics([
            outcome(),
            outcome({runReport: {durationMs: 2000, totals: {tokens: null}, errors: []}}),
        ]);

        expect(metrics.durationMs).toEqual({mean: 1500, min: 1000, max: 2000});
        expect(metrics.tokensIn).toBeNull();
    });
});
