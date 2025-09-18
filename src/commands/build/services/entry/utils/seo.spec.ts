import {describe, expect, it} from 'vitest';
import {getTitle} from './seo';

describe('seo utils', () => {
    describe('getTitle', () => {
        it('should return "dataTitle | tocTitle" if both parameters are provided', () => {
            expect(getTitle('Catalog', 'Home')).toBe('Home | Catalog');
        });

        it('should return only tocTitle if only tocTitle is provided', () => {
            expect(getTitle('Catalog', '')).toBe('Catalog');
            expect(getTitle('Catalog', undefined as any)).toBe('Catalog');
            expect(getTitle('Catalog', null as any)).toBe('Catalog');
        });

        it('should return only dataTitle if only dataTitle is provided', () => {
            expect(getTitle('', 'Home')).toBe('Home');
            expect(getTitle(undefined as any, 'Home')).toBe('Home');
            expect(getTitle(null as any, 'Home')).toBe('Home');
        });

        it('should return an empty string if neither parameter is provided', () => {
            expect(getTitle('', '')).toBe('');
            expect(getTitle(undefined as any, undefined as any)).toBe('');
            expect(getTitle(null as any, null as any)).toBe('');
        });
    });
});
