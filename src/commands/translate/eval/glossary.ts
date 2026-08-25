import type {GlossaryPair, GlossaryViolation} from './types';

import {scanPage} from './markdown';

/**
 * Endings stripped from a glossary source term to tolerate basic
 * russian inflection: the corpus glossary stores nominative forms,
 * while pages use them in any case.
 */
const RU_ENDINGS = [
    'иями',
    'ями',
    'ами',
    'ием',
    'ии',
    'ие',
    'ия',
    'ий',
    'ой',
    'ей',
    'ом',
    'ем',
    'ам',
    'ям',
    'ах',
    'ях',
    'ую',
    'юю',
    'ая',
    'яя',
    'ое',
    'ее',
    'а',
    'я',
    'о',
    'е',
    'у',
    'ю',
    'ы',
    'и',
    'ь',
];

/**
 * Builds a stem for tolerant term matching: the longest known ending
 * is stripped once. Latin terms are matched as-is.
 */
export function stemTerm(term: string): string {
    const lower = term.toLowerCase().trim();

    if (!/\p{Script=Cyrillic}/u.test(lower)) {
        return lower;
    }

    for (const ending of RU_ENDINGS) {
        if (lower.endsWith(ending) && lower.length - ending.length >= 3) {
            return lower.slice(0, -ending.length);
        }
    }

    return lower;
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
 * The check is intentionally lenient about morphology on the source
 * side (stems) and about plural/casing on the target side (lowercase
 * substring): its goal is to catch the model ignoring the glossary,
 * not to lint grammar.
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
        const occurrences = countStemOccurrences(sourceText, stemTerm(pair.sourceText));
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
