export type UnitTriple = {
    /** Page path without the language prefix, e.g. `syntax/code.md`. */
    page: string;
    /** Position of the unit inside the page. */
    index: number;
    source: string;
    baseline: string;
    candidate: string;
};

export type AlignMismatch = {
    page: string;
    /** Which output diverged from the source. */
    side: 'baseline' | 'candidate';
    detail: string;
};

export type AlignResult = {
    triples: UnitTriple[];
    mismatched: AlignMismatch[];
};

export type AlignParams = {
    /** Units of the source corpus, keyed by the captured file path. */
    source: Map<string, string[]>;
    baseline: Map<string, string[]>;
    candidate: Map<string, string[]>;
    stripLang: (file: string) => string;
};

function byPage(units: Map<string, string[]>, stripLang: (file: string) => string) {
    const result = new Map<string, string[]>();

    for (const [file, list] of units) {
        result.set(stripLang(file), list);
    }

    return result;
}

/**
 * Counts the pages where a translated output has a different number of
 * units than the source.
 *
 * Measured per output rather than as a by-product of the pairwise
 * alignment: the baseline is a model too, and a column that is never
 * measured would render as 0 and read as a perfect score.
 */
export function countUnitMismatches(
    source: Map<string, string[]>,
    units: Map<string, string[]>,
    stripLang: (file: string) => string,
): number {
    const pages = byPage(units, stripLang);
    let mismatches = 0;

    for (const [file, list] of source) {
        if (pages.get(stripLang(file))?.length !== list.length) {
            mismatches++;
        }
    }

    return mismatches;
}

/**
 * Aligns the source units with the units of two translated outputs,
 * positionally per page - the same pairing the mock translation memory
 * uses.
 *
 * A page is comparable only when all three lists have the same length:
 * a model that merged or dropped a paragraph cannot be scored segment
 * by segment, and that fact is reported instead of hidden.
 */
export function alignUnits(params: AlignParams): AlignResult {
    const {source, stripLang} = params;
    const baseline = byPage(params.baseline, stripLang);
    const candidate = byPage(params.candidate, stripLang);

    const triples: UnitTriple[] = [];
    const mismatched: AlignMismatch[] = [];

    for (const [file, units] of source) {
        const page = stripLang(file);
        const baselineUnits = baseline.get(page);
        const candidateUnits = candidate.get(page);
        const sides: [AlignMismatch['side'], string[] | undefined][] = [
            ['baseline', baselineUnits],
            ['candidate', candidateUnits],
        ];

        let comparable = true;

        for (const [side, list] of sides) {
            if (list?.length !== units.length) {
                mismatched.push({
                    page,
                    side,
                    detail: `${units.length} source units vs ${list ? list.length : 'no'} ${side} units`,
                });
                comparable = false;
            }
        }

        if (!comparable) {
            continue;
        }

        units.forEach((unit, index) => {
            triples.push({
                page,
                index,
                source: unit,
                baseline: (baselineUnits as string[])[index],
                candidate: (candidateUnits as string[])[index],
            });
        });
    }

    return {triples, mismatched};
}
