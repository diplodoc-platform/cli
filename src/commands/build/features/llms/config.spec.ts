import {describe, expect, it, vi} from 'vitest';

// Mock only ~/core/config (provides `defined` and `option`).
// Mock ~/commands/config to prevent its `toArray` parser from failing.
// fileSizeConverter is imported from ~/commands/build/config — the real
// implementation is used, no copy-paste.
vi.mock('~/core/config', () => ({
    defined: (option: string, ...scopes: Record<string, unknown>[]) => {
        for (const scope of scopes) {
            if (option in scope) {
                return scope[option];
            }
        }
        return null;
    },
    option: vi.fn(),
}));

vi.mock('~/commands/config', () => ({
    options: {},
}));

import {resolveLlmsFullMaxSize} from './config';

describe('resolveLlmsFullMaxSize', () => {
    it('returns default 4M when nothing is set', () => {
        const result = resolveLlmsFullMaxSize({}, {});
        expect(result).toBe(4 * 1024 ** 2);
    });

    it('uses YAML config value (string) when CLI is not set', () => {
        const result = resolveLlmsFullMaxSize({}, {llmsFullMaxSize: '4K'});
        expect(result).toBe(4 * 1024);
    });

    it('uses YAML config value (integer)', () => {
        const result = resolveLlmsFullMaxSize({}, {llmsFullMaxSize: 8192});
        expect(result).toBe(8192);
    });

    it('uses YAML config value with M suffix', () => {
        const result = resolveLlmsFullMaxSize({}, {llmsFullMaxSize: '8M'});
        expect(result).toBe(8 * 1024 ** 2);
    });

    it('CLI value takes priority over YAML', () => {
        const result = resolveLlmsFullMaxSize(
            {llmsFullMaxSize: 2 * 1024 ** 2},
            {llmsFullMaxSize: '4K'},
        );
        expect(result).toBe(2 * 1024 ** 2);
    });

    it('CLI default value (4M) falls back to YAML', () => {
        // CLI arg equals default (4M) → falls back to YAML
        const result = resolveLlmsFullMaxSize(
            {llmsFullMaxSize: 4 * 1024 ** 2},
            {llmsFullMaxSize: '8M'},
        );
        expect(result).toBe(8 * 1024 ** 2);
    });

    it('YAML "0" uses default (disableIfZero)', () => {
        const result = resolveLlmsFullMaxSize({}, {llmsFullMaxSize: '0'});
        expect(result).toBe(4 * 1024 ** 2);
    });

    it('CLI "0" uses default (disableIfZero)', () => {
        // fileSizeConverter with disableIfZero converts '0' to default (4M)
        // so argValue === defaultBytes → falls back to YAML or default
        const result = resolveLlmsFullMaxSize({llmsFullMaxSize: 4 * 1024 ** 2}, {});
        expect(result).toBe(4 * 1024 ** 2);
    });

    it('CLI explicit value with YAML "0" uses CLI', () => {
        const result = resolveLlmsFullMaxSize(
            {llmsFullMaxSize: 2 * 1024 ** 2},
            {llmsFullMaxSize: '0'},
        );
        expect(result).toBe(2 * 1024 ** 2);
    });
});
