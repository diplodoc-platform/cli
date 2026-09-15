import type {
    BenchConfig,
    CandidateConfig,
    JudgeConfig,
    ResolvedBenchConfig,
    ResolvedCandidate,
} from './types';

import {readFileSync} from 'node:fs';
import {load} from 'js-yaml';

function fail(message: string): never {
    throw new Error(`Benchmark config: ${message}`);
}

function text(value: unknown, path: string): string | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (typeof value !== 'string') {
        fail(`${path} must be a string`);
    }
    return value;
}

function parseCandidate(raw: unknown, index: number): CandidateConfig {
    if (!raw || typeof raw !== 'object') {
        fail(`candidate #${index + 1} must be an object`);
    }

    const data = raw as Record<string, unknown>;
    const name = text(data.name, `candidate #${index + 1}: name`);

    if (!name) {
        fail(`candidate #${index + 1}: name is required`);
    }

    const provider = text(data.provider, `candidate "${name}": provider`);

    if (!provider) {
        fail(`candidate "${name}": provider is required`);
    }

    const headers = data.apiHeaders;

    if (headers !== undefined && !Array.isArray(headers)) {
        fail(`candidate "${name}": apiHeaders must be a list of "Name: value" strings`);
    }

    return {
        name,
        provider,
        model: text(data.model, `candidate "${name}": model`),
        apiBase: text(data.apiBase, `candidate "${name}": apiBase`),
        apiHeaders: (headers as unknown[] | undefined)?.map(
            (header, position) =>
                text(header, `candidate "${name}": apiHeaders[${position}]`) as string,
        ),
        folder: text(data.folder, `candidate "${name}": folder`),
        systemPrompt: text(data.systemPrompt, `candidate "${name}": systemPrompt`),
        userPrompt: text(data.userPrompt, `candidate "${name}": userPrompt`),
        authEnv: text(data.authEnv, `candidate "${name}": authEnv`),
    };
}

function parseJudge(raw: unknown): JudgeConfig | null {
    if (!raw) {
        return null;
    }
    if (typeof raw !== 'object') {
        fail('judge must be an object');
    }

    const data = raw as Record<string, unknown>;
    const model = text(data.model, 'judge: model');
    const apiBase = text(data.apiBase, 'judge: apiBase');
    const authEnv = text(data.authEnv, 'judge: authEnv');

    if (!model || !apiBase || !authEnv) {
        fail('judge requires model, apiBase and authEnv');
    }

    const batchSize = data.batchSize;

    if (batchSize !== undefined && (typeof batchSize !== 'number' || batchSize < 1)) {
        fail('judge: batchSize must be a positive number');
    }

    return {model, apiBase, authEnv, batchSize: batchSize as number | undefined};
}

/**
 * Validates the raw YAML shape. Validation is eager and explicit: a
 * benchmark run costs real money, so a typo must fail before the first
 * request instead of halfway through the matrix.
 */
export function parseBenchConfig(raw: unknown): BenchConfig {
    if (!raw || typeof raw !== 'object') {
        fail('the file must contain a mapping');
    }

    const data = raw as Record<string, unknown>;

    if (!Array.isArray(data.candidates)) {
        fail('candidates must be a list');
    }

    const candidates = data.candidates.map((raw, index) => parseCandidate(raw, index));

    if (candidates.length < 2) {
        fail('at least two candidates are required to compare anything');
    }

    const seen = new Set<string>();

    for (const candidate of candidates) {
        if (seen.has(candidate.name)) {
            fail(`duplicate candidate name: ${candidate.name}`);
        }
        seen.add(candidate.name);
    }

    const baseline = text(data.baseline, 'baseline');

    if (!baseline) {
        fail('baseline is required');
    }
    if (!seen.has(baseline)) {
        fail(`baseline "${baseline}" is not among the candidates`);
    }

    return {baseline, judge: parseJudge(data.judge), candidates};
}

export function loadBenchConfig(file: string): BenchConfig {
    return parseBenchConfig(load(readFileSync(file, 'utf8')));
}

/**
 * Replaces environment variable names with their values. Secrets live
 * in the environment only: never in the config file, never in the
 * report.
 */
export function resolveSecrets(
    config: BenchConfig,
    env: Record<string, string | undefined>,
): ResolvedBenchConfig {
    const missing: string[] = [];

    const read = (name: string | undefined): string | undefined => {
        if (!name) {
            return undefined;
        }

        const value = env[name];

        if (!value) {
            missing.push(name);
            return undefined;
        }

        return value;
    };

    const candidates: ResolvedCandidate[] = config.candidates.map((candidate) => ({
        ...candidate,
        auth: read(candidate.authEnv),
    }));

    const judgeAuth = config.judge ? read(config.judge.authEnv) : undefined;

    if (missing.length) {
        fail(`unset environment variables: ${missing.join(', ')}`);
    }

    return {
        baseline: config.baseline,
        candidates,
        judge: config.judge ? {...config.judge, auth: judgeAuth as string} : null,
    };
}
