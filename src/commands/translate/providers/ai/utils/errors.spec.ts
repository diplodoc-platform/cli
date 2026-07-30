import {describe, expect, it} from 'vitest';
import {AxiosError} from 'axios';

import {
    LLMAuthError,
    LLMRateLimitError,
    LLMRequestError,
    LLMResponseError,
    throwLLMError,
} from './errors';

function axiosError(status: number, data: unknown = {}, headers: Record<string, string> = {}) {
    const error = new AxiosError('Request failed');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    error.response = {status, statusText: `HTTP ${status}`, data, headers} as any;
    return error;
}

describe('translate ai errors', () => {
    describe('throwLLMError', () => {
        it('should map 401 to auth error', () => {
            expect(() => throwLLMError(axiosError(401), 'test')).toThrow(LLMAuthError);
        });

        it('should map 403 to auth error', () => {
            expect(() => throwLLMError(axiosError(403), 'test')).toThrow(LLMAuthError);
        });

        it('should map 429 to rate limit error with retry-after', () => {
            try {
                throwLLMError(axiosError(429, {}, {'retry-after': '7'}), 'test');
                expect.unreachable();
            } catch (error) {
                expect(error).toBeInstanceOf(LLMRateLimitError);
                expect((error as LLMRateLimitError).retryAfter).toBe(7);
                expect((error as LLMRateLimitError).retryable).toBe(true);
            }
        });

        it('should map 429 without retry-after header', () => {
            try {
                throwLLMError(axiosError(429), 'test');
                expect.unreachable();
            } catch (error) {
                expect((error as LLMRateLimitError).retryAfter).toBeUndefined();
            }
        });

        it('should mark 5xx as retryable request error', () => {
            try {
                throwLLMError(axiosError(503), 'test');
                expect.unreachable();
            } catch (error) {
                expect(error).toBeInstanceOf(LLMRequestError);
                expect((error as LLMRequestError).retryable).toBe(true);
            }
        });

        it('should mark 4xx as non-retryable request error', () => {
            try {
                throwLLMError(axiosError(400), 'test');
                expect.unreachable();
            } catch (error) {
                expect(error).toBeInstanceOf(LLMRequestError);
                expect((error as LLMRequestError).retryable).toBe(false);
            }
        });

        it('should extract provider error message from response body', () => {
            expect(() =>
                throwLLMError(axiosError(400, {error: {message: 'bad model'}}), 'test'),
            ).toThrow('bad model');
        });

        it('should mark network errors without response as retryable', () => {
            try {
                throwLLMError(new AxiosError('socket hang up'), 'test');
                expect.unreachable();
            } catch (error) {
                expect(error).toBeInstanceOf(LLMRequestError);
                expect((error as LLMRequestError).retryable).toBe(true);
                expect((error as LLMRequestError).message).toBe('socket hang up');
            }
        });

        it('should rethrow non-axios errors as is', () => {
            const original = new LLMResponseError('broken');
            expect(() => throwLLMError(original, 'test')).toThrow(original);
        });
    });
});
