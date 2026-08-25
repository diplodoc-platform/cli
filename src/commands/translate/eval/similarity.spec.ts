import {describe, expect, it} from 'vitest';

import {referenceSimilarity} from './similarity';

describe('translate eval reference similarity', () => {
    it('should score identical texts as 1', () => {
        expect(referenceSimilarity('The build is fast.', 'The build is fast.')).toBe(1);
    });

    it('should score disjoint texts as 0', () => {
        expect(referenceSimilarity('alpha beta', 'gamma delta')).toBe(0);
    });

    it('should score partial overlap in between', () => {
        const score = referenceSimilarity('the quick brown fox', 'the slow brown fox');

        expect(score).toBeGreaterThan(0.5);
        expect(score).toBeLessThan(1);
    });

    it('should ignore code fences', () => {
        const left = ['Text.', '```', 'left code', '```'].join('\n');
        const right = ['Text.', '```', 'completely different', '```'].join('\n');

        expect(referenceSimilarity(left, right)).toBe(1);
    });

    it('should treat two empty pages as identical', () => {
        expect(referenceSimilarity('', '')).toBe(1);
    });
});
