import type {UnitTriple} from './align';
import type {JudgeTask} from './pairwise';

import {describe, expect, it} from 'vitest';

import {buildJudgeRequest, parseJudgeVerdicts, resolveVerdicts, selectPairs} from './pairwise';

const triple = (over: Partial<UnitTriple> = {}): UnitTriple => ({
    page: 'about.md',
    index: 0,
    source: 'Исходный текст',
    baseline: 'Baseline text',
    candidate: 'Candidate text',
    ...over,
});

const task = (over: Partial<JudgeTask> = {}): JudgeTask => ({
    page: 'about.md',
    index: 0,
    source: 'Исходный текст',
    a: 'Candidate text',
    b: 'Baseline text',
    candidateFirst: true,
    ...over,
});

describe('selectPairs', () => {
    it('should skip triples whose translations are identical', () => {
        const selection = selectPairs(
            [triple({baseline: 'Same', candidate: 'Same'}), triple({index: 1})],
            'seed',
        );

        expect(selection.identical).toBe(1);
        expect(selection.tasks).toHaveLength(1);
    });

    it('should treat translations that differ only in inline ids as identical', () => {
        const selection = selectPairs(
            [
                triple({
                    baseline: 'Text <x id="x-1"/> tail',
                    candidate: 'Text <x id="x-77"/> tail',
                }),
            ],
            'seed',
        );

        expect(selection.identical).toBe(1);
        expect(selection.tasks).toHaveLength(0);
    });

    it('should collapse repeated triples', () => {
        const selection = selectPairs([triple(), triple({index: 1})], 'seed');

        expect(selection.deduped).toBe(1);
        expect(selection.tasks).toHaveLength(1);
    });

    it('should assign sides deterministically for a given seed', () => {
        const triples = Array.from({length: 40}, (_, index) =>
            triple({index, source: `Текст ${index}`}),
        );

        const first = selectPairs(triples, 'seed');
        const second = selectPairs(triples, 'seed');
        const other = selectPairs(triples, 'other-seed');

        expect(first.tasks.map((item) => item.candidateFirst)).toEqual(
            second.tasks.map((item) => item.candidateFirst),
        );
        expect(first.tasks.map((item) => item.candidateFirst)).not.toEqual(
            other.tasks.map((item) => item.candidateFirst),
        );
    });

    it('should show each side first roughly half of the time', () => {
        const triples = Array.from({length: 200}, (_, index) =>
            triple({index, source: `Текст ${index}`}),
        );

        const selection = selectPairs(triples, 'seed');
        const first = selection.tasks.filter((item) => item.candidateFirst).length;

        expect(first).toBeGreaterThan(60);
        expect(first).toBeLessThan(140);
    });

    it('should put the candidate into the A slot when it goes first', () => {
        const selection = selectPairs([triple()], 'seed');
        const [item] = selection.tasks;

        expect(item.a).toBe(item.candidateFirst ? 'Candidate text' : 'Baseline text');
        expect(item.b).toBe(item.candidateFirst ? 'Baseline text' : 'Candidate text');
    });
});

describe('buildJudgeRequest', () => {
    it('should number the units and include both variants', () => {
        const request = buildJudgeRequest([task()]);

        expect(request).toContain('1.');
        expect(request).toContain('Исходный текст');
        expect(request).toContain('Baseline text');
        expect(request).toContain('Candidate text');
    });
});

describe('parseJudgeVerdicts', () => {
    it('should parse a fenced JSON array', () => {
        const raw = parseJudgeVerdicts(
            '```json\n[{"id": 1, "winner": "A", "category": "accuracy", "reason": "closer"}]\n```',
            1,
        );

        expect(raw).toEqual([{winner: 'A', category: 'accuracy', reason: 'closer'}]);
    });

    it('should return null for missing, malformed and out-of-range entries', () => {
        const raw = parseJudgeVerdicts(
            '[{"id": 1, "winner": "C", "category": "accuracy", "reason": ""},' +
                '{"id": 5, "winner": "A", "category": "accuracy", "reason": ""}]',
            2,
        );

        expect(raw).toEqual([null, null]);
    });

    it('should fall back to an unknown category', () => {
        const raw = parseJudgeVerdicts(
            '[{"id": 1, "winner": "tie", "category": "vibes", "reason": "same"}]',
            1,
        );

        expect(raw[0]).toEqual({winner: 'tie', category: 'accuracy', reason: 'same'});
    });

    it('should return nulls when the response is not JSON at all', () => {
        expect(parseJudgeVerdicts('I cannot help with that', 2)).toEqual([null, null]);
    });
});

describe('resolveVerdicts', () => {
    it('should map A and B back to the candidate and the baseline', () => {
        const {verdicts, unparsed} = resolveVerdicts(
            [
                task(),
                task({
                    index: 1,
                    source: 'Другой текст',
                    a: 'Baseline text',
                    b: 'Candidate text',
                    candidateFirst: false,
                }),
            ],
            [
                {winner: 'A', category: 'style', reason: 'nicer'},
                {winner: 'A', category: 'accuracy', reason: 'closer'},
            ],
        );

        expect(unparsed).toBe(0);
        expect(verdicts.map((verdict) => verdict.winner)).toEqual(['candidate', 'baseline']);
    });

    it('should carry the judged texts on every verdict', () => {
        const {verdicts} = resolveVerdicts(
            [task({candidateFirst: false, a: 'Baseline text', b: 'Candidate text'})],
            [{winner: 'B', category: 'accuracy', reason: 'closer'}],
        );

        expect(verdicts[0]).toMatchObject({
            winner: 'candidate',
            source: 'Исходный текст',
            baseline: 'Baseline text',
            candidate: 'Candidate text',
        });
    });

    it('should count unparsed verdicts instead of guessing', () => {
        const {verdicts, unparsed} = resolveVerdicts([task()], [null]);

        expect(verdicts).toEqual([]);
        expect(unparsed).toBe(1);
    });
});
