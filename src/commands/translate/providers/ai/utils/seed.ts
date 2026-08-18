export type SeedPairsResult =
    | {status: 'aligned'; pairs: [string, string][]; skipped: number}
    | {status: 'mismatch'; sourceCount: number; targetCount: number};

/**
 * Pairs source units with target units positionally.
 *
 * Positional pairing is only safe when both files split into the same
 * number of units; otherwise a single merged or split sentence shifts
 * the rest of the file and every later pair is wrong - such files are
 * reported as a mismatch and must not be seeded.
 *
 * Identity pairs that still contain source-script characters are
 * untranslated leftovers: seeding them would freeze the source text as
 * a "translation", so they are skipped and left for the LLM.
 */
export function collectSeedPairs(
    sourceUnits: string[],
    targetUnits: string[],
    marker: RegExp | null,
): SeedPairsResult {
    if (sourceUnits.length !== targetUnits.length) {
        return {
            status: 'mismatch',
            sourceCount: sourceUnits.length,
            targetCount: targetUnits.length,
        };
    }

    const pairs: [string, string][] = [];
    let skipped = 0;

    for (let index = 0; index < sourceUnits.length; index++) {
        const source = sourceUnits[index];
        const target = targetUnits[index];

        if (source === target && marker?.test(source)) {
            skipped++;
            continue;
        }

        pairs.push([source, target]);
    }

    return {status: 'aligned', pairs, skipped};
}
