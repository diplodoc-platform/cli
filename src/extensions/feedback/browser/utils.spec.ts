import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {reachGoal, sanitizeInput} from './utils';

describe('sanitizeInput', () => {
    it('returns empty string for non-string input', () => {
        expect(sanitizeInput(undefined)).toBe('');
        expect(sanitizeInput(42)).toBe('');
        expect(sanitizeInput(null)).toBe('');
        expect(sanitizeInput({})).toBe('');
    });

    it('returns empty string for empty string', () => {
        expect(sanitizeInput('')).toBe('');
    });

    it('passes safe text through unchanged', () => {
        expect(sanitizeInput('hello world')).toBe('hello world');
    });

    it('escapes <', () => {
        expect(sanitizeInput('<')).toBe('&lt;');
    });

    it('escapes >', () => {
        expect(sanitizeInput('>')).toBe('&gt;');
    });

    it('escapes "', () => {
        expect(sanitizeInput('"')).toBe('&quot;');
    });

    it("escapes '", () => {
        expect(sanitizeInput("'")).toBe('&#x27;');
    });

    it('escapes /', () => {
        expect(sanitizeInput('/')).toBe('&#x2F;');
    });

    it('escapes a <script> tag', () => {
        expect(sanitizeInput('<script>alert("xss")</script>')).toBe(
            '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;',
        );
    });

    it('truncates input longer than 5000 characters', () => {
        expect(sanitizeInput('a'.repeat(6000))).toHaveLength(5000);
    });

    it('does not truncate input of exactly 5000 characters', () => {
        expect(sanitizeInput('a'.repeat(5000))).toHaveLength(5000);
    });
});

describe('reachGoal', () => {
    const mockYm = vi.fn();

    beforeEach(() => {
        vi.stubGlobal('window', {ym: mockYm});
        mockYm.mockClear();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('does not call ym when metrika is undefined', () => {
        reachGoal({}, 'submit');
        expect(mockYm).not.toHaveBeenCalled();
    });

    it('does not call ym when counterId is 0', () => {
        reachGoal({metrika: {counterId: 0}}, 'submit');
        expect(mockYm).not.toHaveBeenCalled();
    });

    it('calls ym with the default button goal', () => {
        reachGoal({metrika: {counterId: 12345}}, 'button');
        expect(mockYm).toHaveBeenCalledOnce();
        expect(mockYm).toHaveBeenCalledWith(12345, 'reachGoal', 'selection-feedback-button');
    });

    it('calls ym with the default submit goal', () => {
        reachGoal({metrika: {counterId: 12345}}, 'submit');
        expect(mockYm).toHaveBeenCalledWith(12345, 'reachGoal', 'selection-submit');
    });

    it('calls ym with the default cancel goal', () => {
        reachGoal({metrika: {counterId: 12345}}, 'cancel');
        expect(mockYm).toHaveBeenCalledWith(12345, 'reachGoal', 'selection-cancel');
    });

    it('calls ym with a custom goal name when provided', () => {
        reachGoal({metrika: {counterId: 12345, goals: {submit: 'my-submit'}}}, 'submit');
        expect(mockYm).toHaveBeenCalledWith(12345, 'reachGoal', 'my-submit');
    });

    it('falls back to the default goal when only another key is customised', () => {
        reachGoal({metrika: {counterId: 12345, goals: {cancel: 'my-cancel'}}}, 'submit');
        expect(mockYm).toHaveBeenCalledWith(12345, 'reachGoal', 'selection-submit');
    });

    it('does not throw when window.ym is not defined', () => {
        vi.stubGlobal('window', {});
        expect(() => reachGoal({metrika: {counterId: 1}}, 'submit')).not.toThrow();
        expect(mockYm).not.toHaveBeenCalled();
    });
});
