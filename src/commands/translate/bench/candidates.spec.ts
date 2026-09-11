import {describe, expect, it} from 'vitest';

import {parseBenchConfig, resolveSecrets} from './candidates';

const config = {
    baseline: 'current',
    judge: {model: 'judge-model', apiBase: 'https://judge/v1', authEnv: 'JUDGE_KEY'},
    candidates: [
        {name: 'current', provider: 'openai', model: 'a', authEnv: 'A_KEY'},
        {name: 'glm', provider: 'openai', model: 'b', authEnv: 'B_KEY'},
    ],
};

describe('parseBenchConfig', () => {
    it('should accept a well-formed config', () => {
        const parsed = parseBenchConfig(config);

        expect(parsed.baseline).toBe('current');
        expect(parsed.candidates.map((candidate) => candidate.name)).toEqual(['current', 'glm']);
        expect(parsed.judge?.model).toBe('judge-model');
    });

    it('should reject a baseline that is not a candidate', () => {
        expect(() => parseBenchConfig({...config, baseline: 'nope'})).toThrow(
            /baseline "nope" is not among the candidates/,
        );
    });

    it('should reject duplicate candidate names', () => {
        expect(() =>
            parseBenchConfig({...config, candidates: [config.candidates[0], config.candidates[0]]}),
        ).toThrow(/duplicate candidate name: current/);
    });

    it('should require at least two candidates', () => {
        expect(() => parseBenchConfig({...config, candidates: [config.candidates[0]]})).toThrow(
            /at least two candidates/,
        );
    });

    it('should require a provider for every candidate', () => {
        expect(() =>
            parseBenchConfig({
                ...config,
                candidates: [config.candidates[0], {name: 'glm', model: 'b'}],
            }),
        ).toThrow(/candidate "glm": provider is required/);
    });

    it('should require model, apiBase and authEnv of the judge', () => {
        expect(() => parseBenchConfig({...config, judge: {model: 'judge-model'}})).toThrow(
            /judge requires model, apiBase and authEnv/,
        );
    });

    it('should tolerate a config without a judge', () => {
        expect(parseBenchConfig({...config, judge: undefined}).judge).toBeNull();
    });
});

describe('resolveSecrets', () => {
    it('should read keys from the environment', () => {
        const resolved = resolveSecrets(parseBenchConfig(config), {
            A_KEY: 'a-secret',
            B_KEY: 'b-secret',
            JUDGE_KEY: 'judge-secret',
        });

        expect(resolved.candidates[0].auth).toBe('a-secret');
        expect(resolved.judge?.auth).toBe('judge-secret');
    });

    it('should list every missing variable at once', () => {
        expect(() => resolveSecrets(parseBenchConfig(config), {A_KEY: 'a-secret'})).toThrow(
            /B_KEY, JUDGE_KEY/,
        );
    });
});
