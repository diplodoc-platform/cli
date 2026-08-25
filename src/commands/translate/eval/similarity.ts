import {scanPage} from './markdown';

function tokenize(content: string): string[] {
    return scanPage(content)
        .prose.map((line) => line.text)
        .join('\n')
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean);
}

function counts(tokens: string[]): Map<string, number> {
    const result = new Map<string, number>();
    for (const token of tokens) {
        result.set(token, (result.get(token) || 0) + 1);
    }
    return result;
}

/**
 * Token-level F1 similarity between a translation and its reference,
 * 0..1. Code fences are excluded: they must be byte-identical anyway
 * and would inflate the score.
 *
 * This is a coarse signal by design: a real model legitimately phrases
 * things differently from the reference, so similarity is reported as
 * a trend metric and only gates the run when a threshold is set.
 */
export function referenceSimilarity(translated: string, reference: string): number {
    const translatedCounts = counts(tokenize(translated));
    const referenceCounts = counts(tokenize(reference));

    let overlap = 0;
    let translatedTotal = 0;
    let referenceTotal = 0;

    for (const count of translatedCounts.values()) {
        translatedTotal += count;
    }
    for (const count of referenceCounts.values()) {
        referenceTotal += count;
    }

    if (!translatedTotal || !referenceTotal) {
        return translatedTotal === referenceTotal ? 1 : 0;
    }

    for (const [token, count] of translatedCounts) {
        overlap += Math.min(count, referenceCounts.get(token) || 0);
    }

    const precision = overlap / translatedTotal;
    const recall = overlap / referenceTotal;

    if (!precision || !recall) {
        return 0;
    }

    return Math.round(((2 * precision * recall) / (precision + recall)) * 1000) / 1000;
}
