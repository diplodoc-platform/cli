import {describe, expect, it, vi} from 'vitest';

import {mergeCsp} from './csp';

vi.mock('~/constants', () => ({
    DEFAULT_CSP_SETTINGS: {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'none'"],
        'img-src': ["'self'"],
    },
}));

describe('mergeCsp', () => {
    it('should merge multiple CSP hashes and deduplicate values', () => {
        const csp1 = {'script-src': ["'self'", 'https://a.com']};
        const csp2 = {'script-src': ["'self'", 'https://b.com']};
        const csp = [csp1, csp2];

        const result = mergeCsp(csp);

        expect(result).toContainEqual({
            'script-src': ["'self'", 'https://a.com', 'https://b.com'],
        });
    });

    it('should add DEFAULT_CSP_SETTINGS for missing keys', () => {
        const csp = [{'script-src': ['https://a.com']}];
        const result = mergeCsp(csp);

        expect(result).toContainEqual({
            'default-src': ["'self'"],
        });
        expect(result).toContainEqual({
            'img-src': ["'self'"],
        });
    });

    it('should strip out duplicate values', () => {
        const csp = [{'script-src': ["'self'", "'self'", 'https://a.com']}];
        const result = mergeCsp(csp);

        expect(result).toContainEqual({
            'script-src': ["'self'", 'https://a.com'],
        });
    });

    it('should filter out all "none" unless result is empty', () => {
        const csp = [{'script-src': ["'none'"]}];
        const result = mergeCsp(csp);

        expect(result).toContainEqual({
            'script-src': ["'self'"],
        });
    });

    it('should handle empty input', () => {
        const result = mergeCsp([]);

        expect(result).toContainEqual({
            'default-src': ["'self'"],
        });
        expect(result).toContainEqual({
            'script-src': ["'self'", "'none'"],
        });
        expect(result).toContainEqual({
            'img-src': ["'self'"],
        });
    });
});
