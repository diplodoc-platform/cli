import type {UnitTriple} from './align';
import type {VerdictCategory} from './types';

import {normalizeUnitIds} from '../eval/mock';

import {VERDICT_CATEGORIES} from './types';

export type JudgeTask = {
    page: string;
    index: number;
    source: string;
    /** Translation presented to the judge as variant A. */
    a: string;
    /** Translation presented to the judge as variant B. */
    b: string;
    /** True when the candidate occupies the A slot. */
    candidateFirst: boolean;
};

export type PairSelection = {
    tasks: JudgeTask[];
    /** Triples whose translations coincide and need no judging. */
    identical: number;
    /** Repeated triples collapsed into an earlier task. */
    deduped: number;
};

export type RawVerdict = {
    winner: 'A' | 'B' | 'tie';
    category: VerdictCategory;
    reason: string;
};

export type Verdict = {
    page: string;
    index: number;
    winner: 'baseline' | 'candidate' | 'tie';
    category: VerdictCategory;
    reason: string;
    /** The texts the judge compared, for the HTML report. */
    source: string;
    baseline: string;
    candidate: string;
};

/**
 * FNV-1a over the seed and the unit text. Any stable hash would do;
 * this one needs no dependency and yields a reproducible bit per unit.
 */
/* eslint-disable no-bitwise -- FNV-1a is defined in terms of xor and shifts */
function hash(value: string): number {
    let result = 0x811c9dc5;

    for (let index = 0; index < value.length; index++) {
        result ^= value.charCodeAt(index);
        result = Math.imul(result, 0x01000193) >>> 0;
    }

    return result;
}
/* eslint-enable no-bitwise */

/**
 * Picks the triples worth judging and decides which translation goes
 * first.
 *
 * The side comes from a seeded hash of the unit rather than from the
 * candidate order: judges have a documented position bias, and without
 * shuffling the win rate would partly measure who got printed first.
 * Seeding keeps a rerun comparable with the run before it.
 */
export function selectPairs(triples: UnitTriple[], seed: string): PairSelection {
    const tasks: JudgeTask[] = [];
    const seen = new Set<string>();
    let identical = 0;
    let deduped = 0;

    for (const triple of triples) {
        const baseline = normalizeUnitIds(triple.baseline);
        const candidate = normalizeUnitIds(triple.candidate);

        if (baseline === candidate) {
            identical++;
            continue;
        }

        const key = JSON.stringify([normalizeUnitIds(triple.source), baseline, candidate]);

        if (seen.has(key)) {
            deduped++;
            continue;
        }

        seen.add(key);

        const candidateFirst = hash(`${seed}\n${triple.source}`) % 2 === 0;

        tasks.push({
            page: triple.page,
            index: triple.index,
            source: triple.source,
            a: candidateFirst ? triple.candidate : triple.baseline,
            b: candidateFirst ? triple.baseline : triple.candidate,
            candidateFirst,
        });
    }

    return {tasks, identical, deduped};
}

export const JUDGE_SYSTEM_PROMPT = [
    'You are a strict reviewer of technical documentation translations.',
    'For each numbered item you receive the source text and two translations, A and B.',
    'Decide which translation is better for technical documentation, judging',
    'accuracy of meaning, terminology consistency, natural style, and fidelity of',
    'markup (code, links, placeholders, formatting markers).',
    'Answer with a JSON array only, one object per item, no prose around it:',
    '[{"id": 1, "winner": "A" | "B" | "tie", "category": "accuracy" | "terminology" | "style" | "markup", "reason": "<one short sentence>"}]',
    'Use "tie" when neither translation is better. The category names the aspect',
    'that decided the verdict, or the aspect that is equal for a tie.',
].join('\n');

/**
 * Renders the user message of one judge request.
 */
export function buildJudgeRequest(tasks: JudgeTask[]): string {
    return tasks
        .map((task, position) =>
            [`${position + 1}.`, 'SOURCE:', task.source, 'A:', task.a, 'B:', task.b].join('\n'),
        )
        .join('\n\n');
}

function extractJsonArray(content: string): unknown[] | null {
    const start = content.indexOf('[');
    const end = content.lastIndexOf(']');

    if (start === -1 || end <= start) {
        return null;
    }

    try {
        const parsed = JSON.parse(content.slice(start, end + 1));
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

/**
 * Parses the judge response into one entry per requested unit. A
 * missing or malformed entry becomes `null` and is counted later: a
 * guessed verdict would silently move the win rate.
 */
export function parseJudgeVerdicts(content: string, count: number): (RawVerdict | null)[] {
    const result: (RawVerdict | null)[] = new Array(count).fill(null);
    const items = extractJsonArray(content);

    if (!items) {
        return result;
    }

    for (const item of items) {
        if (!item || typeof item !== 'object') {
            continue;
        }

        const data = item as Record<string, unknown>;
        const id = Number(data.id);
        const winner = data.winner;

        if (!Number.isInteger(id) || id < 1 || id > count) {
            continue;
        }
        if (winner !== 'A' && winner !== 'B' && winner !== 'tie') {
            continue;
        }

        const category = VERDICT_CATEGORIES.includes(data.category as VerdictCategory)
            ? (data.category as VerdictCategory)
            : 'accuracy';

        result[id - 1] = {
            winner,
            category,
            reason: typeof data.reason === 'string' ? data.reason : '',
        };
    }

    return result;
}

function decideWinner(winner: RawVerdict['winner'], candidateFirst: boolean): Verdict['winner'] {
    if (winner === 'tie') {
        return 'tie';
    }

    const candidateSide = candidateFirst ? 'A' : 'B';

    return winner === candidateSide ? 'candidate' : 'baseline';
}

/**
 * Turns A/B verdicts back into baseline/candidate verdicts.
 */
export function resolveVerdicts(
    tasks: JudgeTask[],
    raw: (RawVerdict | null)[],
): {verdicts: Verdict[]; unparsed: number} {
    const verdicts: Verdict[] = [];
    let unparsed = 0;

    tasks.forEach((task, position) => {
        const item = raw[position];

        if (!item) {
            unparsed++;
            return;
        }

        verdicts.push({
            page: task.page,
            index: task.index,
            winner: decideWinner(item.winner, task.candidateFirst),
            category: item.category,
            reason: item.reason,
            source: task.source,
            baseline: task.candidateFirst ? task.b : task.a,
            candidate: task.candidateFirst ? task.a : task.b,
        });
    });

    return {verdicts, unparsed};
}
