/* eslint-disable no-console -- the eval runner reports to the terminal by design */
import type {EvalThresholds} from './types';

import {ok} from 'node:assert';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

import {DEFAULT_THRESHOLDS, renderReport} from './report';
import {runEval} from './run';

export type EvalCliArgs = {
    corpus: string;
    cli: string;
    workdir?: string;
    report?: string;
    source: string;
    target: string;
    real: boolean;
    judge: boolean;
    provider: string;
    model?: string;
    judgeModel?: string;
    auth?: string;
    apiBase?: string;
    folder?: string;
    thresholds: EvalThresholds;
};

type StringOption =
    | 'corpus'
    | 'cli'
    | 'workdir'
    | 'report'
    | 'source'
    | 'target'
    | 'provider'
    | 'model'
    | 'judgeModel'
    | 'auth'
    | 'apiBase'
    | 'folder';

const STRING_OPTIONS: Record<string, StringOption> = {
    '--corpus': 'corpus',
    '--cli': 'cli',
    '--workdir': 'workdir',
    '--report': 'report',
    '--source': 'source',
    '--target': 'target',
    '--provider': 'provider',
    '--model': 'model',
    '--judge-model': 'judgeModel',
    '--auth': 'auth',
    '--api-base': 'apiBase',
    '--folder': 'folder',
};

const THRESHOLD_OPTIONS: Record<string, keyof EvalThresholds> = {
    '--max-markup-violations': 'maxMarkupViolations',
    '--max-glossary-violations': 'maxGlossaryViolations',
    '--max-untranslated': 'maxUntranslated',
    '--min-judge-score': 'minJudgeScore',
    '--min-similarity': 'minSimilarity',
};

/**
 * Parses process argv into eval options. Hand-rolled on purpose: the
 * harness must stay independent from the CLI internals it evaluates.
 */
export function parseArgs(argv: string[]): EvalCliArgs {
    const args: EvalCliArgs = {
        corpus: 'tests/eval/corpus',
        cli: 'build/index.js',
        source: 'ru-RU',
        target: 'en-US',
        real: false,
        judge: true,
        provider: 'openai',
        thresholds: {...DEFAULT_THRESHOLDS},
    };

    const takeValue = (name: string, index: number): string => {
        const value = argv[index];
        ok(value !== undefined, `Option ${name} requires a value`);
        return value;
    };

    for (let index = 0; index < argv.length; index++) {
        const name = argv[index];

        if (name === '--real') {
            args.real = true;
        } else if (name === '--no-judge') {
            args.judge = false;
        } else if (STRING_OPTIONS[name]) {
            args[STRING_OPTIONS[name]] = takeValue(name, ++index);
        } else if (THRESHOLD_OPTIONS[name]) {
            args.thresholds[THRESHOLD_OPTIONS[name]] = Number(takeValue(name, ++index));
        } else {
            ok(false, `Unknown option: ${name}`);
        }
    }

    return args;
}

export async function main(argv: string[]): Promise<number> {
    const args = parseArgs(argv);
    const workdir = args.workdir
        ? resolve(args.workdir)
        : mkdtempSync(join(tmpdir(), 'yfm-translate-eval-'));
    const reportFile = args.report ? resolve(args.report) : join(workdir, 'eval-report.json');

    const {report} = await runEval({...args, workdir, reportFile});

    console.log('');
    console.log(renderReport(report));
    console.log('');
    console.log(`JSON report: ${reportFile}`);

    return report.passed ? 0 : 1;
}
