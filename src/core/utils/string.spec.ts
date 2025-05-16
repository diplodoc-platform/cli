import {describe, expect, it} from 'vitest';

import {replaceAll} from './string';

describe('string utils', () => {
    describe('replaceAll', () => {
        it('should replace single match', () => {
            expect(replaceAll('one two three', 'two', 'four')).toEqual('one four three');
        });

        it('should replace single match at start', () => {
            expect(replaceAll('one two three', 'one', 'four')).toEqual('four two three');
        });

        it('should replace single match at end', () => {
            expect(replaceAll('one two three', 'three', 'four')).toEqual('one two four');
        });

        it('should replace multiple match', () => {
            expect(replaceAll('one two three one two three', 'three', 'four')).toEqual(
                'one two four one two four',
            );
        });

        it('should replace match by empty', () => {
            expect(replaceAll('one two three', 'three', '')).toEqual('one two ');
        });

        it('should skip empty', () => {
            expect(replaceAll('', 'three', 'four')).toEqual('');
        });
    });
});
