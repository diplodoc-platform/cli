/* eslint-disable no-console -- the benchmark reports to the terminal by design */
import type {EvalReport} from '../eval/types';
import type {UnitTriple} from './align';
import type {Verdict} from './pairwise';
import type {BenchReport, CandidateMetrics, CandidateReport, RunArtifacts} from './report';
import type {CandidateConfig, JudgeConfig, ResolvedBenchConfig, ResolvedCandidate} from './types';

import {ok} from 'node:assert';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

import {listCorpusPages} from '../eval/corpus';
import {DEFAULT_THRESHOLDS} from '../eval/report';
import {captureUnits, language, runEval, stripLangPrefix} from '../eval/run';

import {alignUnits, countUnitMismatches} from './align';
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

type CandidateRuns = {
    runs: RunOutcome[];
    artifacts: RunArtifacts[];
    /** Captured units of every repeat, in repeat order. */
    units: Map<string, string[]>[];
};

/**
 * Translates the corpus with one candidate, `repeats` times, and
 * captures the units of every output. Runs are sequential: candidates
 * usually share a gateway, and parallel runs would distort the latency
 * numbers and trip rate limits.
 */
async function runCandidate(params: {
    candidate: ResolvedCandidate;
    args: BenchArgs;
    corpus: string;
    cli: string;
    workdir: string;
    /** Units of the source corpus, to measure structural mismatches. */
    sourceUnits: Map<string, string[]>;
}): Promise<CandidateRuns> {
    const {candidate, args, corpus, cli} = params;
    const result: CandidateRuns = {runs: [], artifacts: [], units: []};

    for (let repeat = 1; repeat <= args.repeats; repeat++) {
        const workdir = join(params.workdir, candidate.name, String(repeat));
        mkdirSync(workdir, {recursive: true});

        const evalReportFile = join(workdir, 'eval-report.json');
        const runReportFile = join(workdir, 'translate-report.json');

        console.log(`\n=== ${candidate.name}, repeat ${repeat}/${args.repeats} ===`);

        const run = await runEval({
            corpus,
            cli,
            workdir,
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

        const units = await captureUnits({
            cli,
            corpus: run.output,
            workdir,
            source: args.target,
            target: args.source,
        });

        result.units.push(units);

        result.runs.push({
            report: run.report,
            runReport: readRunReport(runReportFile),
            structuralMismatches: countUnitMismatches(params.sourceUnits, units, stripLangPrefix),
        });

        result.artifacts.push({
            repeat,
            workdir,
            evalReport: evalReportFile,
            runReport: existsSync(runReportFile) ? runReportFile : null,
            failures: run.report.failures,
        });
    }

    return result;
}

/**
 * Collects the segment triples of every repeat: source, baseline
 * translation, candidate translation. Pages that no longer line up are
 * dropped here and warned about; how often a model does that is counted
 * separately, per run, by `countUnitMismatches`.
 */
function alignAgainstBaseline(params: {
    name: string;
    baseline: string;
    sourceUnits: Map<string, string[]>;
    baselineUnits: Map<string, string[]>[];
    units: Map<string, string[]>[];
}): UnitTriple[] {
    const triples: UnitTriple[] = [];

    params.units.forEach((units, position) => {
        const aligned = alignUnits({
            source: params.sourceUnits,
            baseline: params.baselineUnits[position],
            candidate: units,
            stripLang: stripLangPrefix,
        });

        for (const mismatch of aligned.mismatched) {
            console.warn(
                `Warning: ${params.name} vs ${params.baseline}, repeat ${position + 1}: ` +
                    `${mismatch.page} dropped (${mismatch.detail})`,
            );
        }

        triples.push(...aligned.triples);
    });

    return triples;
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

    const executed = new Map<string, CandidateRuns>();

    for (const candidate of resolved.candidates) {
        executed.set(
            candidate.name,
            await runCandidate({candidate, args, corpus, cli, workdir, sourceUnits}),
        );
    }

    const baselineUnits = (executed.get(resolved.baseline) as CandidateRuns).units;
    const candidates: CandidateReport[] = [];

    for (const candidate of resolved.candidates) {
        const runs = executed.get(candidate.name) as CandidateRuns;
        const isBaseline = candidate.name === resolved.baseline;
        const triples = isBaseline
            ? []
            : alignAgainstBaseline({
                  name: candidate.name,
                  baseline: resolved.baseline,
                  sourceUnits,
                  baselineUnits,
                  units: runs.units,
              });

        let pairwise: CandidateReport['pairwise'] = null;

        if (args.pairwise && resolved.judge && triples.length) {
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
            runs: runs.artifacts,
            metrics: collectMetrics(runs.runs),
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
