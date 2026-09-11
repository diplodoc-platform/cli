/* eslint-disable no-console -- the benchmark reports to the terminal by design */
import type {EvalReport} from '../eval/types';
import type {UnitTriple} from './align';
import type {Verdict} from './pairwise';
import type {BenchReport, CandidateMetrics, CandidateReport, RunArtifacts} from './report';
import type {CandidateConfig, JudgeConfig, ResolvedBenchConfig} from './types';

import {ok} from 'node:assert';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

import {listCorpusPages} from '../eval/corpus';
import {DEFAULT_THRESHOLDS} from '../eval/report';
import {captureUnits, language, runEval, stripLangPrefix} from '../eval/run';

import {alignUnits} from './align';
import {spread, summarizePairwise} from './aggregate';
import {loadBenchConfig, resolveSecrets} from './candidates';
import {createChatClient} from './chat';
import {
    JUDGE_SYSTEM_PROMPT,
    buildJudgeRequest,
    parseJudgeVerdicts,
    resolveVerdicts,
    selectPairs,
} from './pairwise';
import {BENCH_SCHEMA_VERSION, renderBenchTable} from './report';
import {renderBenchHtml} from './html';

const DEFAULT_JUDGE_BATCH = 10;

export type BenchArgs = {
    candidates: string;
    corpus: string;
    cli: string;
    workdir?: string;
    report?: string;
    html?: string;
    source: string;
    target: string;
    repeats: number;
    seed: string;
    judge: boolean;
    pairwise: boolean;
    dryRun: boolean;
    maxPairs?: number;
};

const STRING_OPTIONS: Record<string, keyof BenchArgs> = {
    '--candidates': 'candidates',
    '--corpus': 'corpus',
    '--cli': 'cli',
    '--workdir': 'workdir',
    '--report': 'report',
    '--html': 'html',
    '--source': 'source',
    '--target': 'target',
    '--seed': 'seed',
};

export function parseArgs(argv: string[]): BenchArgs {
    const args: BenchArgs = {
        candidates: '',
        corpus: 'tests/eval/corpus',
        cli: 'build/index.js',
        source: 'ru-RU',
        target: 'en-US',
        repeats: 1,
        seed: 'default',
        judge: true,
        pairwise: true,
        dryRun: false,
    };

    const take = (name: string, index: number): string => {
        const value = argv[index];
        ok(value !== undefined, `Option ${name} requires a value`);
        return value;
    };

    for (let index = 0; index < argv.length; index++) {
        const name = argv[index];

        if (name === '--no-judge') {
            args.judge = false;
        } else if (name === '--no-pairwise') {
            args.pairwise = false;
        } else if (name === '--dry-run') {
            args.dryRun = true;
        } else if (name === '--repeats') {
            args.repeats = Number(take(name, ++index));
        } else if (name === '--max-pairs') {
            args.maxPairs = Number(take(name, ++index));
        } else if (STRING_OPTIONS[name]) {
            (args as Record<string, unknown>)[STRING_OPTIONS[name]] = take(name, ++index);
        } else {
            ok(false, `Unknown option: ${name}`);
        }
    }

    ok(args.candidates, 'Option --candidates <path> is required');
    ok(
        Number.isInteger(args.repeats) && args.repeats > 0,
        'Option --repeats must be a positive integer',
    );
    ok(
        args.maxPairs === undefined || (Number.isInteger(args.maxPairs) && args.maxPairs > 0),
        'Option --max-pairs must be a positive integer',
    );

    return args;
}

export type PlanParams = {
    candidates: CandidateConfig[];
    baseline: string;
    judge: JudgeConfig | null;
    repeats: number;
    pages: number;
};

/**
 * Renders what the run is about to do. A benchmark spends real money,
 * so the matrix is inspectable before the first request.
 */
export function renderPlan(params: PlanParams): string {
    const runs = params.candidates.length * params.repeats;
    const variables = [
        ...params.candidates.map((candidate) => candidate.authEnv),
        params.judge?.authEnv,
    ].filter(Boolean) as string[];

    const lines = [
        `Plan: ${runs} translate run(s) over ${params.pages} page(s)`,
        `  baseline: ${params.baseline}`,
    ];

    for (const candidate of params.candidates) {
        lines.push(
            `  ${candidate.name}: ${candidate.provider} ${candidate.model || '(default model)'}` +
                ` x ${params.repeats}`,
        );
    }

    lines.push(
        params.judge
            ? `  pairwise judge: ${params.judge.model}`
            : '  pairwise judge: not configured',
        `  environment variables: ${[...new Set(variables)].join(', ') || 'none'}`,
    );

    return lines.join('\n');
}

type TranslateRunReport = {
    durationMs?: number;
    totals?: {tokens?: {input?: number; output?: number} | null};
    errors?: unknown[];
};

export type RunOutcome = {
    report: EvalReport;
    runReport: TranslateRunReport | null;
    structuralMismatches: number;
};

/**
 * A metric is reported only when every repeat produced it: a partial
 * average would quietly compare different things between candidates.
 */
function collect(values: (number | null)[]) {
    const present = values.filter((value): value is number => value !== null);

    return present.length === values.length ? spread(present) : null;
}

function sum(values: number[]): number {
    return values.reduce((total, value) => total + value, 0);
}

/**
 * Folds the repeats of one candidate into mean/min/max per metric.
 */
export function collectMetrics(outcomes: RunOutcome[]): CandidateMetrics {
    return {
        markup: collect(
            outcomes.map((outcome) =>
                sum(outcome.report.pages.map((page) => page.markupViolations.length)),
            ),
        ),
        glossary: collect(
            outcomes.map((outcome) =>
                sum(outcome.report.pages.map((page) => page.glossaryViolations.length)),
            ),
        ),
        untranslated: collect(
            outcomes.map((outcome) =>
                outcome.report.pages.some((page) => page.untranslated === null)
                    ? null
                    : sum(outcome.report.pages.map((page) => page.untranslated?.length || 0)),
            ),
        ),
        similarity: collect(
            outcomes.map((outcome) => {
                const values = outcome.report.pages
                    .map((page) => page.similarity)
                    .filter((value): value is number => value !== null);

                return values.length === outcome.report.pages.length && values.length
                    ? sum(values) / values.length
                    : null;
            }),
        ),
        judgeScore: collect(outcomes.map((outcome) => outcome.report.judge?.averageScore ?? null)),
        tokensIn: collect(
            outcomes.map((outcome) => outcome.runReport?.totals?.tokens?.input ?? null),
        ),
        tokensOut: collect(
            outcomes.map((outcome) => outcome.runReport?.totals?.tokens?.output ?? null),
        ),
        durationMs: collect(outcomes.map((outcome) => outcome.runReport?.durationMs ?? null)),
        structuralMismatches: collect(outcomes.map((outcome) => outcome.structuralMismatches)),
        errors: collect(outcomes.map((outcome) => outcome.runReport?.errors?.length ?? null)),
    };
}

function readRunReport(file: string): TranslateRunReport | null {
    if (!existsSync(file)) {
        return null;
    }

    try {
        return JSON.parse(readFileSync(file, 'utf8')) as TranslateRunReport;
    } catch {
        return null;
    }
}

async function judgePairs(params: {
    triples: UnitTriple[];
    seed: string;
    judge: JudgeConfig & {auth: string};
    maxPairs?: number;
    log: (message: string) => void;
}): Promise<{verdicts: Verdict[]; identical: number; unparsed: number}> {
    const selection = selectPairs(params.triples, params.seed);
    const tasks = params.maxPairs ? selection.tasks.slice(0, params.maxPairs) : selection.tasks;
    const client = createChatClient({
        apiBase: params.judge.apiBase,
        auth: params.judge.auth,
        model: params.judge.model,
    });

    const batchSize = params.judge.batchSize || DEFAULT_JUDGE_BATCH;
    const verdicts: Verdict[] = [];
    let unparsed = 0;

    params.log(
        `Judging ${tasks.length} pair(s) in batches of ${batchSize} ` +
            `(${selection.identical} identical, ${selection.deduped} duplicate)`,
    );

    for (let start = 0; start < tasks.length; start += batchSize) {
        const batch = tasks.slice(start, start + batchSize);
        const content = await client.complete(JUDGE_SYSTEM_PROMPT, buildJudgeRequest(batch));
        const resolved = resolveVerdicts(batch, parseJudgeVerdicts(content, batch.length));

        verdicts.push(...resolved.verdicts);
        unparsed += resolved.unparsed;
    }

    return {verdicts, identical: selection.identical, unparsed};
}

export async function main(argv: string[]): Promise<number> {
    const args = parseArgs(argv);
    const corpus = resolve(args.corpus);
    const cli = resolve(args.cli);
    const config = loadBenchConfig(resolve(args.candidates));
    const sourceLang = language(args.source);
    const targetLang = language(args.target);
    const pages = listCorpusPages(corpus, sourceLang, targetLang, {
        requireReference: false,
    }).length;

    const plan = renderPlan({
        candidates: config.candidates,
        baseline: config.baseline,
        judge: config.judge,
        repeats: args.repeats,
        pages,
    });

    if (args.dryRun) {
        console.log(plan);
        return 0;
    }

    const resolved: ResolvedBenchConfig = resolveSecrets(config, process.env);
    const workdir = args.workdir
        ? resolve(args.workdir)
        : mkdtempSync(join(tmpdir(), 'yfm-translate-bench-'));
    const reportFile = args.report ? resolve(args.report) : join(workdir, 'bench-report.json');
    const htmlFile = args.html ? resolve(args.html) : join(workdir, 'bench-report.html');
    const startedAt = new Date().toISOString();

    mkdirSync(workdir, {recursive: true});

    console.log(`Bench workdir: ${workdir}`);
    console.log(plan);

    // The source side never changes between candidates, so it is
    // captured once and reused by every comparison.
    const sourceUnits = await captureUnits({
        cli,
        corpus,
        workdir,
        source: args.source,
        target: args.target,
    });

    const outcomes = new Map<string, RunOutcome[]>();
    const artifacts = new Map<string, RunArtifacts[]>();
    const capturedUnits = new Map<string, Map<string, string[]>[]>();

    for (const candidate of resolved.candidates) {
        const runs: RunOutcome[] = [];
        const runArtifacts: RunArtifacts[] = [];
        const units: Map<string, string[]>[] = [];

        for (let repeat = 1; repeat <= args.repeats; repeat++) {
            const runWorkdir = join(workdir, candidate.name, String(repeat));
            mkdirSync(runWorkdir, {recursive: true});

            const evalReportFile = join(runWorkdir, 'eval-report.json');
            const runReportFile = join(runWorkdir, 'translate-report.json');

            console.log(`\n=== ${candidate.name}, repeat ${repeat}/${args.repeats} ===`);

            const result = await runEval({
                corpus,
                cli,
                workdir: runWorkdir,
                reportFile: evalReportFile,
                source: args.source,
                target: args.target,
                real: true,
                judge: args.judge,
                provider: candidate.provider,
                model: candidate.model,
                auth: candidate.auth,
                apiBase: candidate.apiBase,
                apiHeaders: candidate.apiHeaders,
                folder: candidate.folder,
                systemPrompt: candidate.systemPrompt,
                userPrompt: candidate.userPrompt,
                noCache: true,
                runReport: runReportFile,
                requireReference: false,
                thresholds: {...DEFAULT_THRESHOLDS},
                log: (message) => console.log(`  ${message}`),
            });

            units.push(
                await captureUnits({
                    cli,
                    corpus: result.output,
                    workdir: runWorkdir,
                    source: args.target,
                    target: args.source,
                }),
            );

            runs.push({
                report: result.report,
                runReport: readRunReport(runReportFile),
                structuralMismatches: 0,
            });

            runArtifacts.push({
                repeat,
                workdir: runWorkdir,
                evalReport: evalReportFile,
                runReport: existsSync(runReportFile) ? runReportFile : null,
                failures: result.report.failures,
            });
        }

        outcomes.set(candidate.name, runs);
        artifacts.set(candidate.name, runArtifacts);
        capturedUnits.set(candidate.name, units);
    }

    const baselineUnits = capturedUnits.get(resolved.baseline) as Map<string, string[]>[];
    const candidates: CandidateReport[] = [];

    for (const candidate of resolved.candidates) {
        const runs = outcomes.get(candidate.name) as RunOutcome[];
        const units = capturedUnits.get(candidate.name) as Map<string, string[]>[];
        const isBaseline = candidate.name === resolved.baseline;
        const triples: UnitTriple[] = [];

        if (!isBaseline) {
            units.forEach((candidateRun, position) => {
                const aligned = alignUnits({
                    source: sourceUnits,
                    baseline: baselineUnits[position],
                    candidate: candidateRun,
                    stripLang: stripLangPrefix,
                });

                runs[position].structuralMismatches = aligned.mismatched.filter(
                    (mismatch) => mismatch.side === 'candidate',
                ).length;

                for (const mismatch of aligned.mismatched) {
                    console.warn(
                        `Warning: ${candidate.name} repeat ${position + 1}: ` +
                            `${mismatch.page} not comparable (${mismatch.detail})`,
                    );
                }

                triples.push(...aligned.triples);
            });
        }

        let pairwise: CandidateReport['pairwise'] = null;

        if (!isBaseline && args.pairwise && resolved.judge && triples.length) {
            const judged = await judgePairs({
                triples,
                seed: args.seed,
                judge: resolved.judge,
                maxPairs: args.maxPairs,
                log: (message) => console.log(message),
            });

            pairwise = {
                ...summarizePairwise(judged.verdicts, {
                    identical: judged.identical,
                    unparsed: judged.unparsed,
                }),
                verdicts: judged.verdicts,
            };
        }

        candidates.push({
            name: candidate.name,
            provider: candidate.provider,
            model: candidate.model || `(${candidate.provider} default)`,
            runs: artifacts.get(candidate.name) as RunArtifacts[],
            metrics: collectMetrics(runs),
            pairwise,
        });
    }

    const report: BenchReport = {
        schemaVersion: BENCH_SCHEMA_VERSION,
        startedAt,
        finishedAt: new Date().toISOString(),
        corpus,
        sourceLanguage: args.source,
        targetLanguage: args.target,
        baseline: resolved.baseline,
        repeats: args.repeats,
        seed: args.seed,
        candidates,
    };

    writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
    writeFileSync(htmlFile, renderBenchHtml(report));

    console.log('');
    console.log(renderBenchTable(report));
    console.log(`JSON report: ${reportFile}`);
    console.log(`HTML report: ${htmlFile}`);

    return 0;
}
