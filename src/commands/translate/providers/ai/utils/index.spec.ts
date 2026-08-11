import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {
    LLMAuthError,
    LLMRateLimitError,
    LLMResponseError,
    RateGate,
    backoff,
    estimateTokens,
} from './index';

vi.mock('node:crypto', async (importOriginal) => {
    const original = await importOriginal<Record<string, unknown>>();
    // Deterministic jitter for exact-delay assertions.
    return {...original, randomInt: () => 0};
});

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

        it('should give rate limit errors their own retry budget', async () => {
            const action = vi
                .fn()
                .mockRejectedValueOnce(new LLMRateLimitError('slow down'))
                .mockRejectedValueOnce(new LLMRateLimitError('slow down'))
                .mockResolvedValue('ok');

            const promise = backoff(action, 0, {rateLimitRetries: 2});
            const success = expect(promise).resolves.toBe('ok');

            await vi.runAllTimersAsync();
            await success;

            expect(action).toHaveBeenCalledTimes(3);
        });

        it('should not spend the rate limit budget on generic retryable errors', async () => {
            const error = new LLMResponseError('broken response');
            const action = vi.fn().mockRejectedValue(error);

            const promise = backoff(action, 1, {rateLimitRetries: 5});
            const failure = expect(promise).rejects.toBe(error);

            await vi.runAllTimersAsync();
            await failure;

            expect(action).toHaveBeenCalledTimes(2);
        });

        it('should cap the rate limit delay at 60 seconds per attempt', async () => {
            const error = new LLMRateLimitError('slow down');
            const action = vi.fn().mockRejectedValue(error);

            const promise = backoff(action, 0, {rateLimitRetries: 7});
            const failure = expect(promise).rejects.toBe(error);

            // Flush microtasks so the first attempt executes.
            await vi.advanceTimersByTimeAsync(0);

            // Without jitter the first six delays are 1+2+4+8+16+32 = 63s.
            await vi.advanceTimersByTimeAsync(63_000);
            expect(action).toHaveBeenCalledTimes(7);

            // The seventh delay would be 64s; the cap holds it at 60s.
            await vi.advanceTimersByTimeAsync(59_999);
            expect(action).toHaveBeenCalledTimes(7);

            await vi.advanceTimersByTimeAsync(1);
            await failure;
            expect(action).toHaveBeenCalledTimes(8);
        });

        it('should pause all requests behind a shared gate on rate limit', async () => {
            const gate = new RateGate();
            const failing = vi
                .fn()
                .mockRejectedValueOnce(new LLMRateLimitError('slow down', 30))
                .mockResolvedValue('ok');
            const blocked = vi.fn().mockResolvedValue('ok');

            const first = backoff(failing, 0, {rateLimitRetries: 1, gate});
            const firstDone = expect(first).resolves.toBe('ok');

            // Let the first request fail and pause the gate.
            await vi.advanceTimersByTimeAsync(0);

            const second = backoff(blocked, 0, {gate});
            const secondDone = expect(second).resolves.toBe('ok');

            await vi.advanceTimersByTimeAsync(29_999);
            expect(blocked).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(1);
            await firstDone;
            await secondDone;

            expect(blocked).toHaveBeenCalledTimes(1);
        });
    });

    describe('RateGate', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('should not delay waiters when idle', async () => {
            const gate = new RateGate();
            const done = vi.fn();

            gate.wait().then(done);

            await vi.advanceTimersByTimeAsync(0);
            expect(done).toHaveBeenCalled();
        });

        it('should hold waiters until the pause elapses', async () => {
            const gate = new RateGate();
            const done = vi.fn();

            gate.pause(5000);
            gate.wait().then(done);

            await vi.advanceTimersByTimeAsync(4999);
            expect(done).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(1);
            expect(done).toHaveBeenCalled();
        });

        it('should keep the longest deadline when pauses overlap', async () => {
            const gate = new RateGate();
            const done = vi.fn();

            gate.pause(10_000);
            gate.pause(1000);
            gate.wait().then(done);

            await vi.advanceTimersByTimeAsync(9999);
            expect(done).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(1);
            expect(done).toHaveBeenCalled();
        });

        it('should extend an active pause while waiters are blocked', async () => {
            const gate = new RateGate();
            const done = vi.fn();

            gate.pause(5000);
            gate.wait().then(done);

            await vi.advanceTimersByTimeAsync(4000);
            gate.pause(5000);

            await vi.advanceTimersByTimeAsync(4999);
            expect(done).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(1);
            expect(done).toHaveBeenCalled();
        });
    });
});
