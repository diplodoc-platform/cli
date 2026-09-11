import type {Verdict} from './pairwise';
import type {VerdictCategory} from './types';

import {VERDICT_CATEGORIES} from './types';

export type Spread = {
    mean: number;
    min: number;
    max: number;
};

export type CategoryTotals = Record<VerdictCategory, {wins: number; losses: number}>;

export type PairwiseSummary = {
    /** Pairs actually scored by the judge. */
    judged: number;
    /** Pairs whose translations coincided and were not judged. */
    identical: number;
    /** Pairs the judge failed to score. */
    unparsed: number;
    wins: number;
    losses: number;
    ties: number;
    /** (wins + ties / 2) / judged, `null` when nothing was judged. */
    winRate: number | null;
    byCategory: CategoryTotals;
    /** Two-sided sign test over wins and losses. */
    pValue: number;
    significant: boolean;
};

export const SIGNIFICANCE_LEVEL = 0.05;

export function spread(values: number[]): Spread | null {
    if (!values.length) {
        return null;
    }

    return {
        mean: values.reduce((sum, value) => sum + value, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values),
    };
}

/**
 * Lanczos approximation of log(gamma(x)): binomial coefficients of a
 * few thousand pairs overflow a plain factorial.
 */
function logGamma(x: number): number {
    const coefficients = [
        76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155,
        0.1208650973866179e-2, -0.5395239384953e-5,
    ];

    let y = x;
    const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
    let series = 1.000000000190015;

    for (const coefficient of coefficients) {
        series += coefficient / ++y;
    }

    return -tmp + Math.log((2.5066282746310005 * series) / x);
}

function logChoose(n: number, k: number): number {
    return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
}

/**
 * Two-sided exact binomial test against p = 0.5: the probability of a
 * split at least as lopsided as the observed one when the two models
 * are equally good. Ties are dropped by the caller, which is what makes
 * this a sign test.
 */
export function binomialTwoSidedP(wins: number, losses: number): number {
    const total = wins + losses;

    if (total === 0) {
        return 1;
    }

    const extreme = Math.max(wins, losses);
    let tail = 0;

    for (let k = extreme; k <= total; k++) {
        tail += Math.exp(logChoose(total, k) - total * Math.LN2);
    }

    return Math.min(1, 2 * tail);
}

function emptyCategories(): CategoryTotals {
    return Object.fromEntries(
        VERDICT_CATEGORIES.map((category) => [category, {wins: 0, losses: 0}]),
    ) as CategoryTotals;
}

/**
 * Folds the verdicts of one candidate into counts, a win rate and a
 * significance mark.
 */
export function summarizePairwise(
    verdicts: Verdict[],
    extra: {identical: number; unparsed: number},
): PairwiseSummary {
    const byCategory = emptyCategories();
    let wins = 0;
    let losses = 0;
    let ties = 0;

    for (const verdict of verdicts) {
        if (verdict.winner === 'candidate') {
            wins++;
            byCategory[verdict.category].wins++;
        } else if (verdict.winner === 'baseline') {
            losses++;
            byCategory[verdict.category].losses++;
        } else {
            ties++;
        }
    }

    const judged = verdicts.length;
    const pValue = binomialTwoSidedP(wins, losses);

    return {
        judged,
        identical: extra.identical,
        unparsed: extra.unparsed,
        wins,
        losses,
        ties,
        winRate: judged ? (wins + ties / 2) / judged : null,
        byCategory,
        pValue,
        significant: judged > 0 && pValue < SIGNIFICANCE_LEVEL,
    };
}
