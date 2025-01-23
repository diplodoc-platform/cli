import {describe, expect, it} from 'vitest';

import {join, sep} from 'node:path';

import {normalizePath} from './path';

describe('path utils', () => {
    describe('normalizePath', () => {
        it('should normalize relative path', () => {
            expect(normalizePath('test.md')).toBe('test.md');
            expect(normalizePath('./test.md')).toBe('test.md');
            expect(normalizePath('.\\test.md')).toBe('test.md');
        });

        it('should normalize absolute path', () => {
            expect(normalizePath('/test.md')).toBe('/test.md');
            expect(normalizePath('\\test.md')).toBe('/test.md');
            expect(normalizePath('D:\\test.md')).toBe('D:/test.md');
        });

        it('should work with normalized path', () => {
            const path = normalizePath('./test.md');

            expect(join('./sub', path)).toBe(`sub${sep}test.md`);
            expect(join('/sub', path)).toBe(`${sep}sub${sep}test.md`);
        });
    });
});
