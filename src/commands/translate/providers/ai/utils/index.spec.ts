import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {LLMAuthError, LLMRateLimitError, backoff, estimateTokens} from './index';

describe('translate ai utils', () => {
    describe('estimateTokens', () => {
        it('should estimate latin text at ~4 chars per token', () => {
            expect(estimateTokens('a'.repeat(40))).toBe(10);
        });

        it('should estimate non-latin text at ~2 chars per token', () => {
            expect(estimateTokens('ы'.repeat(40))).toBe(20);
        });

        it('should combine both estimates for mixed text', () => {
            expect(estimateTokens('a'.repeat(4) + 'ы'.repeat(4))).toBe(3);
        });
    });

    describe('backoff', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('should return the result on success', async () => {
            const action = vi.fn().mockResolvedValue('ok');

            await expect(backoff(action, 3)).resolves.toBe('ok');
            expect(action).toHaveBeenCalledTimes(1);
        });

        it('should not retry non-retryable errors', async () => {
            const error = new LLMAuthError('denied');
            const action = vi.fn().mockRejectedValue(error);

            await expect(backoff(action, 3)).rejects.toBe(error);
            expect(action).toHaveBeenCalledTimes(1);
        });

        it('should throw the original error when retries are disabled', async () => {
            const error = new LLMRateLimitError('slow down');
            const action = vi.fn().mockRejectedValue(error);

            await expect(backoff(action, 0)).rejects.toBe(error);
            expect(action).toHaveBeenCalledTimes(1);
        });

        it('should retry retryable errors up to the limit', async () => {
            const error = new LLMRateLimitError('slow down');
            const action = vi.fn().mockRejectedValue(error);

            const promise = backoff(action, 2);
            const failure = expect(promise).rejects.toBe(error);

            await vi.runAllTimersAsync();
            await failure;

            expect(action).toHaveBeenCalledTimes(3);
        });

        it('should resolve when a retry succeeds', async () => {
            const action = vi
                .fn()
                .mockRejectedValueOnce(new LLMRateLimitError('slow down'))
                .mockResolvedValue('ok');

            const promise = backoff(action, 2);
            const success = expect(promise).resolves.toBe('ok');

            await vi.runAllTimersAsync();
            await success;

            expect(action).toHaveBeenCalledTimes(2);
        });

        it('should honor server-provided retry-after', async () => {
            const action = vi
                .fn()
                .mockRejectedValueOnce(new LLMRateLimitError('slow down', 7))
                .mockResolvedValue('ok');

            const promise = backoff(action, 1);
            const success = expect(promise).resolves.toBe('ok');

            await vi.advanceTimersByTimeAsync(6999);
            expect(action).toHaveBeenCalledTimes(1);

            await vi.advanceTimersByTimeAsync(1);
            await success;

            expect(action).toHaveBeenCalledTimes(2);
        });
    });
});
