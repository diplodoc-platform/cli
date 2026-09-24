import {describe, expect, it} from 'vitest';

import {removeCommonIndent, selectCodeFragment} from './fragment';

describe('selectCodeFragment', () => {
    it('treats numeric-looking ranges as marker names', () => {
        expect(
            selectCodeFragment('before\n// marker 2\nselected\n// marker 3\nafter', '2-3'),
        ).toEqual({
            content: 'selected',
            warnings: [],
        });
    });

    it('uses file boundaries when numeric-looking markers are missing', () => {
        const result = selectCodeFragment('one\ntwo\nthree\n', '2-9');

        expect(result.content).toBe('one\ntwo\nthree\n');
        expect(result.warnings).toHaveLength(2);
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

    it('selects from a single marker to the end of the file', () => {
        const result = selectCodeFragment('before\n// BEGIN\nfirst\nsecond', 'BEGIN');

        expect(result.content).toBe('first\nsecond');
        expect(result.warnings).toEqual([]);
    });

    it('falls back to the whole file when a single marker is missing', () => {
        const result = selectCodeFragment('one\ntwo', 'MISSING');

        expect(result.content).toBe('one\ntwo');
        expect(result.warnings[0].message).toContain('using the beginning');
    });

    it('normalizes CRLF line endings', () => {
        expect(selectCodeFragment('one\r\ntwo\r\n').content).toBe('one\ntwo\n');
    });
});

describe('removeCommonIndent', () => {
    it('removes the common indentation of non-empty lines', () => {
        expect(removeCommonIndent('    one\n      two\n\n    three')).toBe('one\n  two\n\nthree');
    });
});
