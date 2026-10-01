import type {Snapshot} from './types';

import {describe, expect, it} from 'vitest';

import {runUpdate} from './run';
const snapshot = (before: string, after: string, target: string): Snapshot => ({
    entry: {
        kind: 'update',
        sourcePath: 'ru/a.md',
        targetPath: 'en/a.md',
        sourceBeforePath: 'b',
        sourceAfterPath: 'a',
        targetBeforePath: 't',
    },
    sourceBefore: before,
    sourceAfter: after,
    targetBefore: target,
});
describe('independent incremental edits', () => {
    it('reports every independent planning conflict and keeps counters consistent', async () => {
        const result = await runUpdate(
            snapshot(
                '# A\n\n[One](old-a).\n\n# B\n\n[Two](old-b).',
                '# A\n\n[One](new-a).\n\n# B\n\n[Two](new-b).',
                '# A\n\n[One](human-a).\n\n# B\n\n[Two](human-b).',
            ),
            async () => {
                throw new Error('No fragment should be sent');
            },
        );
        expect(result.output).toBeNull();
        expect(result.diagnostics).toHaveLength(2);
        expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
            'target_alignment_conflict',
            'target_alignment_conflict',
        ]);
        expect(result.planned).toBe(2);
        expect(result.applied).toBe(0);
        expect(result.rejected).toBe(2);
    });
    it.each(['\n', '\r\n'])('removes one separator with %j line endings', async (newline) => {
        const before = ['# A', 'Delete `old`.', 'Keep `new`.'].join(newline + newline);
        const after = ['# A', 'Keep `new`.'].join(newline + newline);
        const target = ['# A', 'Удалить `old`.', 'Оставить `new`.'].join(newline + newline);
        const result = await runUpdate(snapshot(before, after, target), async () => ({
            text: '',
            diagnostics: [],
        }));
        expect(result.output).toBe(['# A', 'Оставить `new`.'].join(newline + newline));
        expect(result).toMatchObject({planned: 1, applied: 1, rejected: 0});
    });
    it('removes consecutive paragraphs without leaving extra blank lines', async () => {
        const result = await runUpdate(
            snapshot(
                '# A\n\nDelete `one`.\n\nDelete `two`.\n\nKeep `three`.',
                '# A\n\nKeep `three`.',
                '# A\n\nУдалить `one`.\n\nУдалить `two`.\n\nОставить `three`.',
            ),
            async () => ({text: '', diagnostics: []}),
        );
        expect(result.output).toBe('# A\n\nОставить `three`.');
        expect(result).toMatchObject({planned: 2, applied: 2, rejected: 0});
    });
    it('requests only the changed heading and preserves unrelated text', async () => {
        const requests: string[] = [];
        const result = await runUpdate(
            snapshot(
                '# Старое\n\nИстория',
                '# Новое\n\nИстория',
                '# Previous\r\n\r\nHuman-only `code`',
            ),
            async (request) => {
                requests.push(request.sourceAfter);
                return {text: '# New title', diagnostics: []};
            },
        );
        expect(requests).toEqual(['# Новое']);
        expect(result.output).toBe('# New title\r\n\r\nHuman-only `code`');
        expect(result.applied).toBe(1);
    });
    it('keeps a successful edit and reports the failed independent fragment', async () => {
        let calls = 0;
        const result = await runUpdate(
            snapshot(
                '# Старое\n\nKeep `stable`\n\nСтарый `x`',
                '# Новое\n\nKeep `stable`\n\nНовый `x`',
                '# Previous\n\nKeep `stable`\n\nOld `x`',
            ),
            async () =>
                ++calls === 1
                    ? {text: '# New', diagnostics: []}
                    : {text: '', diagnostics: [{code: 'invalid_output', message: 'broken markup'}]},
        );
        expect(result.output).toBe('# New\n\nKeep `stable`\n\nOld `x`');
        expect(result.applied).toBe(1);
        expect(result.rejected).toBe(1);
    });
    it('never sends ambiguous content to the provider', async () => {
        let calls = 0;
        const result = await runUpdate(snapshot('Старое', 'Новое', 'Old'), async () => {
            calls++;
            return {text: 'New', diagnostics: []};
        });
        expect(calls).toBe(0);
        expect(result.output).toBeNull();
    });
    it('keeps target-local links and placeholders in a changed paragraph', async () => {
        let sent = '';
        const result = await runUpdate(
            snapshot('Старый `x` [текст](#ru).', 'Новый `x` [текст](#ru).', 'Old `x` [text](#en).'),
            async (request) => {
                sent = request.sourceAfter;
                return {text: 'New `x` [text](#en).', diagnostics: []};
            },
        );
        expect(sent).toContain('(#en)');
        expect(result.output).toBe('New `x` [text](#en).');
    });
    it('rejects model output that adds extra blocks', async () => {
        const result = await runUpdate(snapshot('# Old', '# New', '# Previous'), async () => ({
            text: '# Translated\n\nExtra paragraph',
            diagnostics: [],
        }));
        expect(result.output).toBeNull();
    });
});

it('does not send opaque conditional neighbors as reference context', async () => {
    const requests: unknown[] = [];
    const hidden = '\n\n{% if audience == "internal" %}\nINTERNAL_SECRET\n{% endif %}';
    const result = await runUpdate(
        snapshot('# Старое' + hidden, '# Новое' + hidden, '# Previous' + hidden),
        async (request) => {
            requests.push(request);
            return {text: '# New', diagnostics: []};
        },
    );
    expect(result.applied).toBe(1);
    expect(JSON.stringify(requests)).not.toContain('INTERNAL_SECRET');
});

it('does not discard a target-only explanation inside a changed paragraph', async () => {
    let calls = 0;
    const result = await runUpdate(
        snapshot('Старое `x`.', 'Новое `x`.', 'Old `x`. Human explanation.'),
        async () => {
            calls++;
            return {text: 'New `x`.', diagnostics: []};
        },
    );
    expect(result.output).toBeNull();
    expect(calls).toBe(0);
});

it('removes a target-only code style when the source removes that name', async () => {
    let calls = 0;
    const result = await runUpdate(
        snapshot(
            '# Query {#query}\n\nПрагма yt.QueryCacheMode управляет результатами в {{product-name}}.',
            '# Query {#query}\n\nПрагма управляет результатами в {{product-name}}.',
            '# Query {#query}\n\nUse the `yt.QueryCacheMode` pragma to control results in {{product-name}}.',
        ),
        async (request) => {
            calls++;
            expect(request.sourceAfter).toBe('Прагма управляет результатами в {{product-name}}.');
            return {text: 'The pragma controls results in {{product-name}}.', diagnostics: []};
        },
    );
    expect(calls).toBe(1);
    expect(result.output).toBe(
        '# Query {#query}\n\nThe pragma controls results in {{product-name}}.',
    );
    expect(result.rejected).toBe(0);
});

it('keeps a target-only code token when the source still names it', async () => {
    let calls = 0;
    const result = await runUpdate(
        snapshot(
            '# Query {#query}\n\nПрагма yt.QueryCacheMode управляет результатами.',
            '# Query {#query}\n\nПрагма yt.QueryCacheMode управляет кешем.',
            '# Query {#query}\n\nThe `yt.QueryCacheMode` pragma controls results.',
        ),
        async () => {
            calls++;
            return {text: 'The pragma controls the cache.', diagnostics: []};
        },
    );
    expect(calls).toBe(0);
    expect(result.output).toBeNull();
});

it('rejects reordered localized token kinds before asking the model', async () => {
    let calls = 0;
    const result = await runUpdate(
        snapshot('Старый `x` [текст](#ru).', 'Новый `x` [текст](#ru).', 'Old [text](#en) `x`.'),
        async (request) => {
            calls++;
            return {text: request.sourceAfter, diagnostics: []};
        },
    );
    expect(result.output).toBeNull();
    expect(calls).toBe(0);
});

it('does not silently skip whitespace changes inside inline code', async () => {
    const result = await runUpdate(
        snapshot('Use `a b`.', 'Use `a  b`.', 'Use `a b`.'),
        async (request) => ({text: request.sourceAfter, diagnostics: []}),
    );
    expect(result.output).toBe('Use `a  b`.');
    expect(result.diagnostics).toEqual([]);
});
