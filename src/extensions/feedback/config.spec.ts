import {describe, expect, it} from 'vitest';

import {resolveTextFeedback, validateConfig} from './config';

describe('resolveTextFeedback', () => {
    it('returns undefined for undefined', () => {
        expect(resolveTextFeedback(undefined)).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
        expect(resolveTextFeedback('')).toBeUndefined();
    });

    it('wraps a string URL into an object', () => {
        expect(resolveTextFeedback('https://example.com/feedback')).toEqual({
            endpoint: 'https://example.com/feedback',
        });
    });

    it('returns an object as-is', () => {
        const obj = {endpoint: 'https://example.com/feedback'};
        expect(resolveTextFeedback(obj)).toBe(obj);
    });

    it('returns an object with metrika as-is', () => {
        const obj = {
            endpoint: 'https://example.com/feedback',
            metrika: {counterId: 12345678, goals: {button: 'my-btn'}},
        };
        expect(resolveTextFeedback(obj)).toBe(obj);
    });
});

describe('validateConfig', () => {
    it('does not throw for undefined', () => {
        expect(() => validateConfig(undefined)).not.toThrow();
    });

    it('does not throw for a valid URL string', () => {
        expect(() => validateConfig('https://example.com/feedback')).not.toThrow();
    });

    it('does not throw for a valid object', () => {
        expect(() => validateConfig({endpoint: 'https://example.com/feedback'})).not.toThrow();
    });

    it('does not throw for a valid object with metrika', () => {
        expect(() =>
            validateConfig({
                endpoint: 'https://example.com/feedback',
                metrika: {counterId: 12345678},
            }),
        ).not.toThrow();
    });

    it('throws for an empty endpoint string', () => {
        expect(() => validateConfig({endpoint: ''})).toThrow(
            '[TextFeedback] textFeedback.endpoint must be a non-empty string',
        );
    });

    it('throws for a whitespace-only endpoint', () => {
        expect(() => validateConfig({endpoint: '   '})).toThrow(
            '[TextFeedback] textFeedback.endpoint must be a non-empty string',
        );
    });

    it('throws for metrika.counterId of 0', () => {
        expect(() =>
            validateConfig({endpoint: 'https://example.com', metrika: {counterId: 0}}),
        ).toThrow('[TextFeedback] textFeedback.metrika.counterId must be a positive integer');
    });

    it('throws for a negative metrika.counterId', () => {
        expect(() =>
            validateConfig({endpoint: 'https://example.com', metrika: {counterId: -1}}),
        ).toThrow('[TextFeedback] textFeedback.metrika.counterId must be a positive integer');
    });

    it('throws for a non-integer metrika.counterId', () => {
        expect(() =>
            validateConfig({endpoint: 'https://example.com', metrika: {counterId: 1.5}}),
        ).toThrow('[TextFeedback] textFeedback.metrika.counterId must be a positive integer');
    });
});
