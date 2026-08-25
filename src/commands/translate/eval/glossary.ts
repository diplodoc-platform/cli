import type {GlossaryPair, GlossaryViolation} from './types';

import {scanPage} from './markdown';

/**
 * Matching prefix for a term: the explicit `sourceStem` from the
 * glossary when present, otherwise the term itself.
 *
 * Stems are configuration, not linguistics: the corpus glossary
 * declares the invariant prefix that covers every inflected form used
 * by the pages (e.g. `заметк` for `заметка` -> `заметки`, `заметку`),
 * so the checker needs no language-specific stemming rules.
 */
export function termStem(pair: GlossaryPair): string {
    return (pair.sourceStem || pair.sourceText).toLowerCase().trim();
}

function countStemOccurrences(text: string, stem: string): number {
    const lower = text.toLowerCase();
    let count = 0;
    let index = lower.indexOf(stem);
    while (index !== -1) {
        count++;
        index = lower.indexOf(stem, index + stem.length);
    }
    return count;
}

/**
 * Checks that every glossary term used in the source page is rendered
 * with its required translation.
 *
 * The check is intentionally lenient: stems match any inflected form
 * on the source side, and the target side is a lowercase substring
 * search. Its goal is to catch the model ignoring the glossary, not
 * to lint grammar.
 */
export function checkGlossary(
    source: string,
    translated: string,
    pairs: GlossaryPair[],
): GlossaryViolation[] {
    const violations: GlossaryViolation[] = [];

    const sourceText = scanPage(source)
        .prose.map((line) => line.text)
        .join('\n');
    const translatedText = translated.toLowerCase();

    for (const pair of pairs) {
        const occurrences = countStemOccurrences(sourceText, termStem(pair));
        if (!occurrences) {
            continue;
        }

        if (!translatedText.includes(pair.translatedText.toLowerCase())) {
            violations.push({
                sourceText: pair.sourceText,
                translatedText: pair.translatedText,
                sourceOccurrences: occurrences,
            });
        }
    }

    return violations;
}
