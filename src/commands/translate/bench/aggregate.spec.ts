import type {Verdict} from './pairwise';

import {describe, expect, it} from 'vitest';

import {binomialTwoSidedP, spread, summarizePairwise} from './aggregate';

const verdict = (
    winner: Verdict['winner'],
    category: Verdict['category'] = 'accuracy',
): Verdict => ({
    page: 'about.md',
    index: 0,
    winner,
    category,
    reason: '',
    source: 'Исходный текст',
    baseline: 'Baseline text',
    candidate: 'Candidate text',
});

describe('spread', () => {
    it('should report mean, min and max', () => {
        expect(spread([1, 2, 3])).toEqual({mean: 2, min: 1, max: 3});
    });

    it('should handle a single value', () => {
        expect(spread([0.5])).toEqual({mean: 0.5, min: 0.5, max: 0.5});
    });

    it('should return null for no values', () => {
        expect(spread([])).toBeNull();
    });
});

describe('binomialTwoSidedP', () => {
    it('should be 1 for a perfect tie', () => {
        expect(binomialTwoSidedP(5, 5)).toBeCloseTo(1, 10);
    });

    it('should match known values', () => {
        expect(binomialTwoSidedP(10, 0)).toBeCloseTo(0.001953125, 9);
        expect(binomialTwoSidedP(7, 3)).toBeCloseTo(0.34375, 9);
        expect(binomialTwoSidedP(60, 40)).toBeCloseTo(0.056887, 5);
    });

    it('should be symmetric', () => {
        expect(binomialTwoSidedP(3, 7)).toBeCloseTo(binomialTwoSidedP(7, 3), 12);
    });

    it('should be 1 when there is nothing to test', () => {
        expect(binomialTwoSidedP(0, 0)).toBe(1);
    });
});

describe('summarizePairwise', () => {
    it('should count outcomes and compute the win rate with ties as half', () => {
        const summary = summarizePairwise(
            [verdict('candidate'), verdict('candidate'), verdict('baseline'), verdict('tie')],
            {identical: 10, unparsed: 1},
        );

        expect(summary).toMatchObject({
            judged: 4,
            wins: 2,
            losses: 1,
            ties: 1,
            identical: 10,
            unparsed: 1,
        });
        expect(summary.winRate).toBeCloseTo(0.625, 10);
    });

    it('should break wins and losses down by category', () => {
        const summary = summarizePairwise(
            [verdict('candidate', 'style'), verdict('baseline', 'terminology')],
            {identical: 0, unparsed: 0},
        );

        expect(summary.byCategory.style).toEqual({wins: 1, losses: 0});
        expect(summary.byCategory.terminology).toEqual({wins: 0, losses: 1});
        expect(summary.byCategory.markup).toEqual({wins: 0, losses: 0});
    });

    it('should mark a lopsided result as significant', () => {
        const verdicts = [
            ...Array.from({length: 30}, () => verdict('candidate')),
            ...Array.from({length: 10}, () => verdict('baseline')),
        ];

        expect(summarizePairwise(verdicts, {identical: 0, unparsed: 0}).significant).toBe(true);
    });

    it('should mark a near-even result as inconclusive', () => {
        const verdicts = [
            ...Array.from({length: 11}, () => verdict('candidate')),
            ...Array.from({length: 9}, () => verdict('baseline')),
        ];

        expect(summarizePairwise(verdicts, {identical: 0, unparsed: 0}).significant).toBe(false);
    });

    it('should have no win rate without judged pairs', () => {
        const summary = summarizePairwise([], {identical: 5, unparsed: 0});

        expect(summary.winRate).toBeNull();
        expect(summary.significant).toBe(false);
    });
});
