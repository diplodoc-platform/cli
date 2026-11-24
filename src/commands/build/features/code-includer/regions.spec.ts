import {describe, expect, it} from 'vitest';

import {CodeRegions} from './regions';

describe('named code regions', () => {
    it.each([
        ['// #region auth-v2', '// #endregion auth-v2'],
        ['# #region auth-v2', '# #endregion'],
        ['// [START auth-v2]', '// [END auth-v2]'],
        ['<!-- [START auth-v2] -->', '<!-- [END auth-v2] -->'],
        ['/* #region auth-v2 */', '/* #endregion */'],
        ['/* #region auth-v2 */', '/* #endregion auth-v2 */'],
        ['<!-- #region auth-v2 -->', '<!-- #endregion -->'],
        ['<!-- #region auth-v2 -->', '<!-- #endregion auth-v2 -->'],
        ['/* #region auth-v2 */', '/* #endregion*/'],
        ['<!-- #region auth-v2 -->', '<!-- #endregion-->'],
    ])('supports markers %s / %s', (opening, closing) => {
        const regions = new CodeRegions(
            ['before', opening, '', '  first()', '    second()', '', closing, 'after'].join('\r\n'),
        );
        expect(regions.select('auth-v2')).toBe('  first()\n    second()');
    });

    it('removes nested markers in both formats and selects each region separately', () => {
        const regions = new CodeRegions(
            [
                '// #region outer',
                'first',
                '// [START inner]',
                'second',
                '// [END inner]',
                'third',
                '// #endregion',
            ].join('\n'),
        );
        expect(regions.select('outer')).toBe('first\nsecond\nthird');
        expect(regions.select('inner')).toBe('second');
    });

    it('matches complete region names rather than prefixes', () => {
        const regions = new CodeRegions('// #region auth-v2\nvalue\n// #endregion');
        expect(() => regions.select('auth')).toThrow('region "auth" was not found');
    });

    it.each(['[START' + ' '.repeat(50000), '[START '.repeat(20000)])(
        'keeps long incomplete bracket markers as source text',
        (line) => {
            const regions = new CodeRegions(['// #region outer', line, '// #endregion'].join('\n'));
            expect(regions.select('outer')).toBe(line);
        },
    );

    it('does not confuse marker-like words with region boundaries', () => {
        const body = ['[STARTED auth]', '[ENDING auth]'].join('\n');
        const regions = new CodeRegions(['// #region outer', body, '// #endregion'].join('\n'));
        expect(regions.select('outer')).toBe(body);
    });

    it.each(['-banner', '-old', '.name', '/name', ':label', 'é', '0', '_suffix'])(
        'keeps hash marker-like text with suffix %s inside a region',
        (suffix) => {
            const body = [
                `// #region${suffix}`,
                'first();',
                `// #endregion${suffix}`,
                'second();',
            ].join('\n');
            const regions = new CodeRegions(['// #region outer', body, '// #endregion'].join('\n'));
            expect(regions.select('outer')).toBe(body);
        },
    );

    it('does not treat a marker-like closing keyword as a matching boundary', () => {
        expect(
            () => new CodeRegions('// #region r\nfirst();\n// #endregion-old\nsecond();'),
        ).toThrow('not closed');
        expect(() => new CodeRegions('// #region-banner\nvalue();')).not.toThrow();
    });

    it('closes the innermost region before a block-comment terminator', () => {
        const regions = new CodeRegions(
            [
                '<!-- #region outer -->',
                'before',
                '/* #region inner */',
                'nested',
                '/* #endregion */',
                'after',
                '<!-- #endregion -->',
            ].join('\n'),
        );
        expect(regions.select('inner')).toBe('nested');
        expect(regions.select('outer')).toBe('before\nnested\nafter');
    });

    it.each([
        ['// #region r\nvalue', 'not closed'],
        ['// #endregion r', 'no opening marker'],
        ['// [END r]', 'no opening marker'],
        ['// #region r\nx\n// #endregion\n// [START r]\ny\n// [END r]', 'duplicated'],
        ['// #region r\n// #region r\nx\n// #endregion\n// #endregion', 'duplicated'],
        ['// #region outer\n// #region inner\nx\n// #endregion outer', 'closes before "inner"'],
        ['// #region r\nx\n// #endregion other', 'closes before "r"'],
        ['// [START]\nx\n// [END]', 'invalid region name'],
        ['// #region\nx\n// #endregion', 'region name is missing'],
        ['// #region r!\nx\n// #endregion', 'invalid region name'],
        ['// [START invalid name]\nx\n// [END invalid name]', 'invalid region name'],
        ['// [START r!]\nx\n// [END r!]', 'invalid region name'],
    ])('rejects malformed structure: %s', (source, message) => {
        expect(() => new CodeRegions(source)).toThrow(message);
    });

    it('validates the whole region structure of a referenced source file', () => {
        expect(() => new CodeRegions('// #region ok\nx\n// #endregion\n// #region broken')).toThrow(
            '"broken"',
        );
    });

    it('rejects selected regions that contain only blank lines or empty nested regions', () => {
        const regions = new CodeRegions(
            '// #region outer\n\n// #region inner\n  \n// #endregion\n// #endregion',
        );
        expect(() => regions.select('outer')).toThrow('region "outer" is empty');
        expect(() => regions.select('inner')).toThrow('region "inner" is empty');
    });

    it('indexes deeply nested regions without recursive traversal or text duplication', () => {
        const depth = 10000;
        const openings = Array.from({length: depth}, (_, index) => `// #region r${index}`);
        const closings = Array.from({length: depth}, () => '// #endregion');
        const regions = new CodeRegions([...openings, 'value', ...closings].join('\n'));
        expect(regions.select('r0')).toBe('value');
        expect(regions.select(`r${depth - 1}`)).toBe('value');
    });
});
