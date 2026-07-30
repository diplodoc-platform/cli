import type {Logger} from '~/core/logger';
import type {LLMClient} from './clients/types';

import {describe, expect, it, vi} from 'vitest';

import {judgeTranslations, parseJudgeResponse} from './judge';
import {LLMAuthError} from './utils';

function makeJudgeClient(respond: (count: number, call: number) => string | Error) {
    let call = 0;

    const client: LLMClient = {
        name: 'fake',
        complete: vi.fn(async (messages) => {
            const count = (messages[messages.length - 1].content.match(/^\[\d+\]$/gm) || []).length;
            const result = respond(count, call++);

            if (result instanceof Error) {
                throw result;
            }

            return {text: result};
        }),
    };

    return client;
}

const allGood = (count: number) =>
    JSON.stringify(
        Array.from({length: count}, (_, i) => ({index: i + 1, score: 90 + i, issue: ''})),
    );

function makeParams(client: LLMClient, pairs: {source: string; translation: string}[]) {
    const warn = vi.fn();

    return {
        warn,
        params: {
            client,
            pairs: pairs.map((pair) => ({path: 'file.md', ...pair})),
            sourceLanguage: 'ru',
            targetLanguage: 'en',
            maxBatchTokens: 100,
            maxOutputTokens: 100,
            maxConcurrency: 2,
            retry: 0,
            logger: {warn} as unknown as Logger,
        },
    };
}

describe('translate ai judge', () => {
    describe('parseJudgeResponse', () => {
        it('should parse a plain json array', () => {
            expect(parseJudgeResponse('[{"index": 1, "score": 95, "issue": ""}]')).toEqual([
                {index: 1, score: 95, issue: ''},
            ]);
        });

        it('should parse a fenced json array', () => {
            const text = '```json\n[{"index": 1, "score": 42, "issue": "terminology"}]\n```';

            expect(parseJudgeResponse(text)).toEqual([{index: 1, score: 42, issue: 'terminology'}]);
        });

        it('should clamp scores into the 0-100 range', () => {
            expect(parseJudgeResponse('[{"index": 1, "score": 150}]')).toEqual([
                {index: 1, score: 100, issue: ''},
            ]);
        });

        it('should reject non-json and wrong shapes', () => {
            expect(parseJudgeResponse('The translation looks fine.')).toBeNull();
            expect(parseJudgeResponse('{"index": 1}')).toBeNull();
            expect(parseJudgeResponse('[{"score": "high"}]')).toBeNull();
        });
    });

    describe('judgeTranslations', () => {
        it('should map scores back to pairs', async () => {
            const client = makeJudgeClient(allGood);
            const {params} = makeParams(client, [
                {source: 'Один', translation: 'One'},
                {source: 'Два', translation: 'Two'},
            ]);

            const verdicts = await judgeTranslations(params);

            expect(verdicts).toEqual([
                {path: 'file.md', source: 'Один', translation: 'One', score: 90, issue: ''},
                {path: 'file.md', source: 'Два', translation: 'Two', score: 91, issue: ''},
            ]);
        });

        it('should dedupe identical pairs before scoring', async () => {
            const client = makeJudgeClient(allGood);
            const {params} = makeParams(client, [
                {source: 'Один', translation: 'One'},
                {source: 'Один', translation: 'One'},
            ]);

            const verdicts = await judgeTranslations(params);

            expect(verdicts).toHaveLength(1);
        });

        it('should split pairs into batches by token budget', async () => {
            const client = makeJudgeClient(allGood);
            const {params} = makeParams(client, [
                {source: 'а'.repeat(80), translation: 'a'.repeat(80)},
                {source: 'б'.repeat(80), translation: 'b'.repeat(80)},
            ]);

            await judgeTranslations(params);

            expect(client.complete).toHaveBeenCalledTimes(2);
        });

        it('should skip unparsable batches without failing', async () => {
            const client = makeJudgeClient(() => 'not a json');
            const {params, warn} = makeParams(client, [{source: 'Один', translation: 'One'}]);

            const verdicts = await judgeTranslations(params);

            expect(verdicts).toEqual([]);
            expect(warn).toHaveBeenCalledWith('judge', expect.stringContaining('Unparsable'));
        });

        it('should survive client errors', async () => {
            const client = makeJudgeClient(() => new LLMAuthError('denied'));
            const {params, warn} = makeParams(client, [{source: 'Один', translation: 'One'}]);

            const verdicts = await judgeTranslations(params);

            expect(verdicts).toEqual([]);
            expect(warn).toHaveBeenCalledWith('judge', expect.stringContaining('denied'));
        });
    });
});
