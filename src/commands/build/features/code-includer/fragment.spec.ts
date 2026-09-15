import {describe, expect, it} from 'vitest';

import {CodeRangeError, removeCommonIndent, selectCodeFragment} from './fragment';

describe('selectCodeFragment', () => {
    it('selects a one-based inclusive numeric range', () => {
        expect(selectCodeFragment('one\ntwo\nthree\nfour\n', '2-3')).toEqual({
            content: 'two\nthree',
            warnings: [],
        });
    });

    it.each(['0-2', '3-2', '2-9'])(`rejects invalid numeric range %s`, (range) => {
        expect(() => selectCodeFragment('one\ntwo\nthree\n', range)).toThrow(CodeRangeError);
    });

    it('excludes legacy marker lines', () => {
        expect(
            selectCodeFragment(
                'before\n// [BEGIN example]\n  selected\n// [END example]\nafter\n',
                '[BEGIN example]-[END example]',
            ),
        ).toEqual({content: '  selected', warnings: []});
    });

    it('falls back to file boundaries for missing legacy markers', () => {
        const missingStart = selectCodeFragment('first\nsecond\n// END\nafter', 'BEGIN-END');
        const missingEnd = selectCodeFragment('before\n// BEGIN\nlast', 'BEGIN-END');

        expect(missingStart.content).toBe('first\nsecond');
        expect(missingStart.warnings[0].message).toContain('using the beginning');
        expect(missingEnd.content).toBe('last');
        expect(missingEnd.warnings[0].message).toContain('using the end');
    });

    it('returns an empty fragment when markers are reversed', () => {
        const result = selectCodeFragment('// END\nvalue\n// BEGIN', 'BEGIN-END');

        expect(result.content).toBe('');
        expect(result.warnings[0].message).toContain('the fragment is empty');
    });

    it('normalizes CRLF line endings', () => {
        expect(selectCodeFragment('one\r\ntwo\r\n', '1-2').content).toBe('one\ntwo');
    });
});

describe('removeCommonIndent', () => {
    it('removes the common indentation of non-empty lines', () => {
        expect(removeCommonIndent('    one\n      two\n\n    three')).toBe('one\n  two\n\nthree');
    });
});
