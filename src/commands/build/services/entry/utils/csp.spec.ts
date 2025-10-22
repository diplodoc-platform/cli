import {describe, expect, it, vi} from 'vitest';

import {mergeCsp} from './csp';

vi.mock('~/constants', () => ({
    DEFAULT_CSP_SETTINGS: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'img-src': ["'self'"],
        'style-src': ["'none'"],
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

    it('should filter out "none" when there are other values from input', () => {
        const csp = [{'script-src': ["'none'", 'https://a.com']}];
        const result = mergeCsp(csp);

        expect(result).toContainEqual({
            'script-src': ["'self'", 'https://a.com'],
        });
    });

    it('should filter out "none" when there are other values from defaults', () => {
        const csp = [{'script-src': ["'none'"]}];
        const result = mergeCsp(csp);

        expect(result).toContainEqual({
            'script-src': ["'self'"],
        });
    });

    it('should keep "none" only when both input and defaults have only "none"', () => {
        const csp = [{'style-src': ["'none'"]}];
        const result = mergeCsp(csp);

        expect(result).toContainEqual({
            'style-src': ["'none'"],
        });
    });

    it('should override "none" from defaults when input has real values', () => {
        const csp = [{'style-src': ['https://a.com']}];
        const result = mergeCsp(csp);

        expect(result).toContainEqual({
            'style-src': ['https://a.com'],
        });
    });

    it('should merge defaults with input values, filtering out "none"', () => {
        const csp = [{'script-src': ['https://a.com']}];
        const result = mergeCsp(csp);

        expect(result).toContainEqual({
            'script-src': ["'self'", 'https://a.com'],
        });
    });

    it('should handle empty input and return only defaults', () => {
        const result = mergeCsp([]);

        expect(result).toContainEqual({
            'default-src': ["'self'"],
        });
        expect(result).toContainEqual({
            'script-src': ["'self'"],
        });
        expect(result).toContainEqual({
            'img-src': ["'self'"],
        });
        expect(result).toContainEqual({
            'style-src': ["'none'"],
        });
    });

    it('should handle multiple inputs with "none" and real values', () => {
        const csp1 = {'script-src': ["'none'"]};
        const csp2 = {'script-src': ['https://a.com']};
        const csp3 = {'script-src': ["'none'", 'https://b.com']};
        const csp = [csp1, csp2, csp3];

        const result = mergeCsp(csp);

        expect(result).toContainEqual({
            'script-src': ["'self'", 'https://a.com', 'https://b.com'],
        });
    });

    it('should handle complex merge with multiple directives', () => {
        const csp1 = {
            'script-src': ['https://a.com'],
            'img-src': ['https://images.com'],
        };
        const csp2 = {
            'script-src': ['https://b.com'],
            'style-src': ['https://styles.com'],
        };
        const csp = [csp1, csp2];

        const result = mergeCsp(csp);

        expect(result).toContainEqual({
            'script-src': ["'self'", 'https://a.com', 'https://b.com'],
        });
        expect(result).toContainEqual({
            'img-src': ["'self'", 'https://images.com'],
        });
        expect(result).toContainEqual({
            'style-src': ['https://styles.com'],
        });
        expect(result).toContainEqual({
            'default-src': ["'self'"],
        });
    });

    it('should preserve order independence when merging', () => {
        const csp1 = [{'script-src': ['https://a.com']}, {'script-src': ['https://b.com']}];
        const csp2 = [{'script-src': ['https://b.com']}, {'script-src': ['https://a.com']}];

        const result1 = mergeCsp(csp1);
        const result2 = mergeCsp(csp2);

        const scriptSrc1 = result1.find((item) => 'script-src' in item);
        const scriptSrc2 = result2.find((item) => 'script-src' in item);

        expect(scriptSrc1?.['script-src'].sort()).toEqual(scriptSrc2?.['script-src'].sort());
    });
});
