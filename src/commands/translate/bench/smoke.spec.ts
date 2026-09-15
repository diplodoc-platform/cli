import type {EvalRunOptions} from '../eval/run';

import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';

const state = vi.hoisted(() => ({outputCaptures: 0, mergeBaseline: false}));

/**
 * The translate runs and the unit capture are the only parts that need
 * a CLI binary and a provider; stubbing exactly those exercises the
 * whole orchestrator offline.
 */
vi.mock('../eval/run', async () => {
    const actual = (await vi.importActual('../eval/run')) as Record<string, unknown>;
    const fs = await import('node:fs');
    const path = await import('node:path');

    return {
        ...actual,
        runEval: vi.fn(async (options: EvalRunOptions) => {
            const report = {
                corpus: options.corpus,
                sourceLanguage: options.source,
                targetLanguage: options.target,
                mode: 'real',
                model: options.model,
                pages: [
                    {
                        page: 'about.md',
                        markupViolations: [],
                        glossaryViolations: [],
                        untranslated: null,
                        similarity: null,
                        judgeLow: 0,
                    },
                ],
                judge: null,
                thresholds: {},
                failures: [],
                passed: true,
            };

            fs.writeFileSync(options.reportFile, JSON.stringify(report));

            return {
                report,
                workdir: options.workdir,
                output: path.join(options.workdir, 'out'),
                reportFile: options.reportFile,
            };
        }),
        captureUnits: vi.fn(async (params: {source: string}) => {
            // The source corpus is captured once, then every candidate
            // output; they are told apart by the capture direction.
            if (params.source === 'ru-RU') {
                return new Map([['ru/about.md', ['Собери документацию', 'Запусти']]]);
            }

            state.outputCaptures++;

            if (state.outputCaptures === 1) {
                // The baseline is captured first.
                return state.mergeBaseline
                    ? new Map([['en/about.md', ['Build the docs and run it']]])
                    : new Map([['en/about.md', ['Build the docs', 'Run it']]]);
            }

            return new Map([['en/about.md', ['Assemble the documentation', 'Run it']]]);
        }),
    };
});

function setup(): string {
    const root = mkdtempSync(join(tmpdir(), 'bench-smoke-'));

    mkdirSync(join(root, 'corpus', 'ru'), {recursive: true});
    writeFileSync(join(root, 'corpus', 'ru', 'about.md'), '# Собери документацию\n');
    writeFileSync(join(root, 'index.js'), '');
    writeFileSync(
        join(root, 'candidates.yaml'),
        [
            'baseline: current',
            'judge:',
            '    model: judge',
            '    apiBase: https://judge/v1',
            '    authEnv: JUDGE_KEY',
            'candidates:',
            '    - name: current',
            '      provider: openai',
            '      model: a',
            '      authEnv: A_KEY',
            '    - name: glm',
            '      provider: openai',
            '      model: b',
            '      authEnv: B_KEY',
        ].join('\n'),
    );

    vi.stubEnv('A_KEY', 'a');
    vi.stubEnv('B_KEY', 'b');
    vi.stubEnv('JUDGE_KEY', 'j');

    return root;
}

afterEach(() => {
    state.outputCaptures = 0;
    state.mergeBaseline = false;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe('bench main', () => {
    it('should run the matrix, judge the differing pairs and write both reports', async () => {
        const {main} = await import('./cli');
        const root = setup();

        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation(
                async () =>
                    new Response(
                        JSON.stringify({
                            choices: [
                                {
                                    message: {
                                        content:
                                            '[{"id": 1, "winner": "A", "category": "terminology", "reason": "better term"}]',
                                    },
                                },
                            ],
                        }),
                        {status: 200},
                    ),
            ),
        );

        const code = await main([
            '--candidates',
            join(root, 'candidates.yaml'),
            '--corpus',
            join(root, 'corpus'),
            '--cli',
            join(root, 'index.js'),
            '--workdir',
            root,
            '--no-judge',
        ]);

        expect(code).toBe(0);

        const report = JSON.parse(readFileSync(join(root, 'bench-report.json'), 'utf8'));
        const glm = report.candidates.find((candidate: {name: string}) => candidate.name === 'glm');

        expect(report.candidates).toHaveLength(2);
        expect(glm.pairwise.judged).toBe(1);
        // "Run it" is identical on both sides and costs no judge call.
        expect(glm.pairwise.identical).toBe(1);
        expect(glm.pairwise.verdicts[0].reason).toBe('better term');

        const html = readFileSync(join(root, 'bench-report.html'), 'utf8');

        expect(html).toContain('better term');
        expect(html).toContain('Assemble the documentation');
    });

    it('should measure structural mismatches of the baseline too', async () => {
        const {main} = await import('./cli');
        const root = setup();

        // The baseline merges the two source units into one: its own
        // struct column must show that, not a default zero.
        state.mergeBaseline = true;

        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const code = await main([
            '--candidates',
            join(root, 'candidates.yaml'),
            '--corpus',
            join(root, 'corpus'),
            '--cli',
            join(root, 'index.js'),
            '--workdir',
            root,
            '--no-judge',
        ]);

        expect(code).toBe(0);

        const report = JSON.parse(readFileSync(join(root, 'bench-report.json'), 'utf8'));
        const byName = (name: string) =>
            report.candidates.find((candidate: {name: string}) => candidate.name === name);

        expect(byName('current').metrics.structuralMismatches.mean).toBe(1);
        expect(byName('glm').metrics.structuralMismatches.mean).toBe(0);
        // The only page is not comparable, so nothing reaches the judge.
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should print the plan and spend nothing in dry-run mode', async () => {
        const {main} = await import('./cli');
        const root = setup();

        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const code = await main([
            '--candidates',
            join(root, 'candidates.yaml'),
            '--corpus',
            join(root, 'corpus'),
            '--cli',
            join(root, 'index.js'),
            '--repeats',
            '3',
            '--dry-run',
        ]);

        expect(code).toBe(0);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(log.mock.calls[0][0]).toContain('6 translate run(s) over 1 page(s)');
    });
});
