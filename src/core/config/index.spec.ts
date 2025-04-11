import {describe, expect, it} from 'vitest';

import {toggleable} from '.';

describe('config utils', () => {
    describe('toggleable', () => {
        it('should use args with priority', () => {
            const result = toggleable('field', {field: true}, {field: false});

            expect(result).toEqual({enabled: true});
        });

        it('should use config base value', () => {
            expect(toggleable('field', {}, {field: true})).toEqual({enabled: true});
            expect(toggleable('field', {}, {field: false})).toEqual({enabled: false});
        });

        it('should use config default value', () => {
            expect(toggleable('field', {}, {field: {}})).toEqual({enabled: true});
        });

        it('should use config enabled value', () => {
            expect(toggleable('field', {}, {field: {enabled: true}})).toEqual({enabled: true});
            expect(toggleable('field', {}, {field: {enabled: false}})).toEqual({enabled: false});
        });

        it('should use deep config fields', () => {
            expect(toggleable('field', {field: true}, {field: {deep: 1}})).toEqual({
                enabled: true,
                deep: 1,
            });
        });
    });
});
