import {describe, expect, it} from 'vitest';

import {FragmentError, extract} from './fragment';

const GO = [
    'package main',
    '',
    'func main() {',
    '\t// #region connect',
    '\tdb, err := ydb.Open(ctx, dsn)',
    '\tif err != nil {',
    '\t\treturn err',
    '\t}',
    '\t// #endregion connect',
    '}',
].join('\n');

describe('extract', () => {
    it('should return the whole file when no fragment is requested', () => {
        const result = extract(GO, null);

        expect(result.code).toBe(GO);
        expect(result).toMatchObject({start: 1, end: 10});
    });

    it('should extract a region without its markers', () => {
        const result = extract(GO, {type: 'region', name: 'connect'});

        expect(result.code).toBe(
            ['db, err := ydb.Open(ctx, dsn)', 'if err != nil {', '\treturn err', '}'].join('\n'),
        );
    });

    it('should report source line range of the region, for permalinks', () => {
        const result = extract(GO, {type: 'region', name: 'connect'});

        expect(result).toMatchObject({start: 5, end: 8});
    });

    it('should dedent by default and keep relative indentation', () => {
        const result = extract(GO, {type: 'region', name: 'connect'});

        expect(result.code).toContain('\nif err != nil {');
        expect(result.code).toContain('\n\treturn err');
    });

    it('should keep indentation when dedent is disabled', () => {
        const result = extract(GO, {type: 'region', name: 'connect'}, false);

        expect(result.code.startsWith('\tdb, err')).toBe(true);
    });

    it('should support the [START]/[END] convention', () => {
        const content = ['// [START connect]', 'connect()', '// [END connect]'].join('\n');

        expect(extract(content, {type: 'region', name: 'connect'}).code).toBe('connect()');
    });

    it('should strip markers of nested regions', () => {
        const content = [
            '# #region outer',
            'a = 1',
            '# #region inner',
            'b = 2',
            '# #endregion inner',
            'c = 3',
            '# #endregion outer',
        ].join('\n');

        expect(extract(content, {type: 'region', name: 'outer'}).code).toBe('a = 1\nb = 2\nc = 3');
    });

    it('should extract a nested region on its own', () => {
        const content = [
            '# #region outer',
            'a = 1',
            '# #region inner',
            'b = 2',
            '# #endregion inner',
            '# #endregion outer',
        ].join('\n');

        expect(extract(content, {type: 'region', name: 'inner'}).code).toBe('b = 2');
    });

    it('should close the innermost region on a bare #endregion', () => {
        const content = ['# #region only', 'value', '# #endregion'].join('\n');

        expect(extract(content, {type: 'region', name: 'only'}).code).toBe('value');
    });

    it('should extract a line range', () => {
        const result = extract(GO, {type: 'lines', start: 1, end: 1});

        expect(result.code).toBe('package main');
        expect(result).toMatchObject({start: 1, end: 1});
    });

    it('should trim blank lines and shift the reported range', () => {
        const content = ['# #region r', '', 'value', '', '# #endregion r'].join('\n');
        const result = extract(content, {type: 'region', name: 'r'});

        expect(result.code).toBe('value');
        expect(result).toMatchObject({start: 3, end: 3});
    });

    it('should fail loudly on a missing region', () => {
        expect(() => extract(GO, {type: 'region', name: 'gone'})).toThrow(FragmentError);
        expect(() => extract(GO, {type: 'region', name: 'gone'})).toThrow(/not found/);
    });

    it('should fail on an unclosed region', () => {
        const content = ['# #region open', 'value'].join('\n');

        expect(() => extract(content, {type: 'region', name: 'open'})).toThrow(/not closed/);
    });

    it('should fail on an out of bounds line range', () => {
        expect(() => extract(GO, {type: 'lines', start: 100, end: 120})).toThrow(/out of bounds/);
    });

    it('should normalize CRLF source files', () => {
        const content = ['# #region r', 'a = 1', 'b = 2', '# #endregion r'].join('\r\n');
        const result = extract(content, {type: 'region', name: 'r'});

        expect(result.code).toBe('a = 1\nb = 2');
        expect(result.code).not.toContain('\r');
    });

    it('should fail on an empty region', () => {
        const content = ['# #region empty', '', '# #endregion empty'].join('\n');

        expect(() => extract(content, {type: 'region', name: 'empty'})).toThrow(/empty/);
    });
});
