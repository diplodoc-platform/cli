import type {Snapshot} from './types';

import {describe, expect, it} from 'vitest';

import {planUpdate} from './plan';
const snapshot = (sourceBefore: string, sourceAfter: string, targetBefore: string): Snapshot => ({
    entry: {
        kind: 'update',
        sourcePath: 'ru/a.md',
        targetPath: 'en/a.md',
        sourceBeforePath: 'before',
        sourceAfterPath: 'after',
        targetBeforePath: 'target',
    },
    sourceBefore,
    sourceAfter,
    targetBefore,
});
describe('source delta planner', () => {
    it('updates a unique title without backfilling unrelated missing source prose', () => {
        const plan = planUpdate(
            snapshot(
                '# Старый\n\nНет перевода',
                '# Новый\n\nНет перевода',
                '# Previous\n\nHuman-only text',
            ),
        );
        expect(plan).toMatchObject({
            ok: true,
            changes: [{expected: '# Previous', sourceBefore: '# Старый', sourceAfter: '# Новый'}],
        });
        if (plan.ok) {
            expect(plan.changes).toHaveLength(1);
        }
    });
    it('changes only the paragraph identified by a unique code anchor', () => {
        const plan = planUpdate(
            snapshot(
                'Старое `query_cache`.\n\nОпределение `keep`.',
                'Новое `query_cache`.\n\nОпределение `keep`.',
                'Old `query_cache`.\n\nHuman `keep`.',
            ),
        );
        expect(plan).toMatchObject({ok: true, changes: [{expected: 'Old `query_cache`.'}]});
    });
    it('rejects repeated paragraphs without positional guesses', () => {
        expect(
            planUpdate(snapshot('Старое\n\nСтарое', 'Новое\n\nСтарое', 'Old\n\nOld')),
        ).toMatchObject({ok: false});
    });
    it('returns no changes for identical sources despite divergent target', () => {
        expect(planUpdate(snapshot('one', 'one', 'human'))).toEqual({ok: true, changes: []});
    });
    it('does not backfill historical releases on a new release insertion', () => {
        const plan = planUpdate(
            snapshot(
                '# Releases\n\n## 25.4\n\nOld',
                '# Releases\n\n## 26.1\n\nNew\n\n## 25.4\n\nOld',
                '# Релизы\n\n## 25.3\n\nРучной текст',
            ),
        );
        expect(plan.ok).toBe(true);
        if (plan.ok)
            expect(plan.changes.map((change) => change.sourceAfter).join('')).toBe(
                '## 26.1\n\nNew',
            );
    });
    it('rejects changed YFM containers rather than rewriting the file', () => {
        expect(
            planUpdate(
                snapshot(
                    '{% cut "Old" %}\nText\n{% endcut %}',
                    '{% cut "New" %}\nText\n{% endcut %}',
                    'Localized',
                ),
            ),
        ).toMatchObject({ok: false, diagnostic: {code: 'target_alignment_conflict'}});
    });
    it('deletes only a uniquely anchored paragraph', () => {
        expect(
            planUpdate(
                snapshot(
                    'Remove `old`.\n\nKeep `new`.',
                    'Keep `new`.',
                    'Удалить `old`.\n\nОставить `new`.',
                ),
            ),
        ).toMatchObject({ok: true, changes: [{expected: 'Удалить `old`.\n\n', sourceAfter: ''}]});
    });
    it('deletes an opaque block only when the target has the exact same bytes', () => {
        const before = '# A\n\n> Shared note.\n\nKeep.';
        const after = '# A\n\nKeep.';
        expect(
            planUpdate(snapshot(before, after, '# A\n\n> Shared note.\n\nRetain.')),
        ).toMatchObject({
            ok: true,
            changes: [{expected: '\n\n> Shared note.', literalOutput: '', sourceAfter: ''}],
        });
        expect(
            planUpdate(snapshot(before, after, '# A\n\n> Human note.\n\nRetain.')),
        ).toMatchObject({ok: false});
    });
    it('patches a unique numeric table value without rewriting translated prose', () => {
        const before = '| `spark.timeout` | `300 seconds` | Таймаут на чтение |';
        const after = '| `spark.timeout` | `30 seconds` | Таймаут на чтение |';
        expect(
            planUpdate(
                snapshot(before, after, '| `spark.timeout` | `300 seconds` | Read timeout. |'),
            ),
        ).toMatchObject({
            ok: true,
            changes: [{literalOutput: '| `spark.timeout` | `30 seconds` | Read timeout. |'}],
        });
        expect(
            planUpdate(
                snapshot(before, after, '| `spark.timeout` | `600 seconds` | Read timeout. |'),
            ),
        ).toMatchObject({ok: false});
        expect(
            planUpdate(
                snapshot(
                    before,
                    after,
                    '| `spark.timeout` | `30 seconds` | Previously 300 seconds. |',
                ),
            ),
        ).toMatchObject({
            ok: true,
            changes: [
                {literalOutput: '| `spark.timeout` | `30 seconds` | Previously 300 seconds. |'},
            ],
        });
    });
    it('keeps a uniquely mapped block that already equals the new source', () => {
        const before = '| `Static Table` | &#65794; |';
        const after = '| `Static Table` | &#10003; |';
        expect(planUpdate(snapshot(before, after, after))).toMatchObject({
            ok: true,
            changes: [{expected: after, literalOutput: after}],
        });
        const divergent = '| `Static Table` | &#9711; |';
        expect(planUpdate(snapshot(before, after, divergent))).toMatchObject({
            ok: true,
            changes: [{expected: divergent, literalOutput: undefined}],
        });
    });
    it('moves a uniform tab selection across repeated translated groups', () => {
        const group =
            '{% list tabs dropdown group=deploy %}\n\n- Docker {selected}\n\nТекст Docker.\n\n- Kind\n\nТекст Kind.\n\n{% endlist %}';
        const before = '# A\n\n' + group + '\n\n## B\n\n' + group;
        const after = before
            .replace(/- Docker \{selected\}/g, '- Docker')
            .replace(/- Kind/g, '- Kind {selected}');
        const translated =
            '# A\n\n' +
            group.replace(/Текст/g, 'Text').replace(' group=deploy', '') +
            '\n\n## B\n\n' +
            group.replace(/Текст/g, 'Text');
        const plan = planUpdate(snapshot(before, after, translated));
        expect(plan.ok).toBe(true);
        if (plan.ok) {
            expect(plan.changes).toHaveLength(4);
            expect(plan.changes.every((change) => change.literalOutput !== undefined)).toBe(true);
        }
        const independentlyChanged = translated.replace(
            '- Docker {selected}\n\nText Docker.',
            '- Docker\n\nText Docker.',
        );
        expect(planUpdate(snapshot(before, after, independentlyChanged)).ok).toBe(false);
    });
    it('inserts at an adjacent pair of uniquely mapped boundaries', () => {
        expect(
            planUpdate(
                snapshot(
                    '# A {#a}\n\n# B {#b}',
                    '# A {#a}\n\nNew\n\n# B {#b}',
                    '# А {#a}\n\n# Б {#b}',
                ),
            ),
        ).toMatchObject({ok: true, changes: [{expected: '', sourceAfter: 'New'}]});
    });
});
