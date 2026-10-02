import type {Snapshot} from './types';

import {describe, expect, it} from 'vitest';

import {planUpdate} from './plan';
import {runUpdate} from './run';
import {correspond} from './correspondence';
import {extractRawBlocks} from './ranges';

const snapshot = (sourceBefore: string, sourceAfter: string, targetBefore: string): Snapshot => ({
    entry: {
        kind: 'update',
        sourcePath: 'ru/a.md',
        targetPath: 'en/a.md',
        sourceBeforePath: 'b',
        sourceAfterPath: 'a',
        targetBeforePath: 't',
    },
    sourceBefore,
    sourceAfter,
    targetBefore,
});

describe('structural incremental updates', () => {
    it('maps neighboring prose inside an anchored section and preserves other sections', async () => {
        const before =
            '# Документ\n\n## Кеш {#cache}\n\nСтарое описание.\n\n{% note info %}\n\nСтарое ограничение.\n\n{% endnote %}\n\n## Другое {#other}\n\nИстория.';
        const after = before
            .replace('Старое описание.', 'Новое описание.')
            .replace('Старое ограничение.', 'Новое ограничение.');
        const target =
            '# Document\n\n## Cache {#cache}\n\nOld description.\n\n{% note info %}\n\nOld restriction.\n\n{% endnote %}\n\n## Other {#other}\n\nHuman-only history.';
        const result = await runUpdate(snapshot(before, after, target), async ({sourceAfter}) => ({
            text: sourceAfter
                .replace('Новое описание.', 'New description.')
                .replace('Новое ограничение.', 'New restriction.'),
            diagnostics: [],
        }));
        expect(result.output).toBe(
            target
                .replace('Old description.', 'New description.')
                .replace('Old restriction.', 'New restriction.'),
        );
        expect(result.applied).toBe(2);
    });
    it('inserts only the new release before missing historical sections', () => {
        const old =
            '# Releases\n\nReleases:\n\n{% cut "25.4" %}\n\nMissing history\n\n{% endcut %}\n\n{% cut "25.3" %}\n\nOld\n\n{% endcut %}';
        const addition = '{% cut "26.1" %}\n\n## Changes\n\n- Added `feature`.\n\n{% endcut %}\n\n';
        const plan = planUpdate(
            snapshot(
                old,
                old.replace('{% cut "25.4" %}', addition + '{% cut "25.4" %}'),
                '# Релизы\n\nРелизы:\n\n{% cut "25.3" %}\n\nРучной текст\n\n{% endcut %}',
            ),
        );
        expect(plan.ok).toBe(true);
        if (plan.ok) {
            expect(plan.changes).toHaveLength(1);
            expect(plan.changes[0].sourceAfter).toBe(addition.trim());
            expect(plan.changes[0].expected).toBe('');
        }
    });
    it('updates a small unanchored paragraph under a unique title', async () => {
        const result = await runUpdate(
            snapshot(
                '# Пример\n\nРесурс 123.',
                '# Пример\n\nРесурс 456.',
                '# Example\n\nResource 123.',
            ),
            async () => ({text: 'Resource 456.', diagnostics: []}),
        );
        expect(result.output).toBe('# Example\n\nResource 456.');
    });
    it('inserts before a unique note whose title was translated', async () => {
        const before =
            '# Таблицы\n\nПосле создания они монтируются.\n\n{% note warning "Внимание" %}\n\nНе меняйте таблицы через `yt flow show-logs`.\n\n{% endnote %}';
        const after = before.replace(
            '{% note warning "Внимание" %}',
            'Новый абзац.\n\n{% note warning "Внимание" %}',
        );
        const target =
            '# Tables\n\nThey are mounted after creation.\n\n{% note warning "Attention" %}\n\nDo not change tables through `yt flow show-logs`.\n\n{% endnote %}';
        const result = await runUpdate(snapshot(before, after, target), async () => ({
            text: 'New paragraph.',
            diagnostics: [],
        }));
        expect(result.output).toBe(
            target.replace(
                '{% note warning "Attention" %}',
                'New paragraph.\n\n{% note warning "Attention" %}',
            ),
        );
        expect(result.rejected).toBe(0);
    });
    it('does not identify a translated note by its type alone', () => {
        const before =
            '# A\n\nOld.\n\n{% note warning "Внимание" %}\n\nUse `source-command`.\n\n{% endnote %}';
        const after = before.replace(
            '{% note warning "Внимание" %}',
            'New.\n\n{% note warning "Внимание" %}',
        );
        const target =
            '# A\n\nOld.\n\n{% note warning "Attention" %}\n\nUse `different-command`.\n\n{% endnote %}';
        expect(planUpdate(snapshot(before, after, target)).ok).toBe(false);
    });
    it('does not use an ambiguous repeated note as an insertion boundary', () => {
        const before =
            '# A\n\n{% note warning "Первое" %}\n\nОдин.\n\n{% endnote %}\n\n{% note warning "Второе" %}\n\nДва.\n\n{% endnote %}';
        const after = before.replace(
            '{% note warning "Второе" %}',
            'Новый абзац.\n\n{% note warning "Второе" %}',
        );
        const target =
            '# A\n\n{% note warning "Extra" %}\n\nHuman.\n\n{% endnote %}\n\n{% note warning "First" %}\n\nOne.\n\n{% endnote %}\n\n{% note warning "Second" %}\n\nTwo.\n\n{% endnote %}';
        expect(planUpdate(snapshot(before, after, target)).ok).toBe(false);
    });
    it('updates a title and inserts an introduction together', () => {
        const plan = planUpdate(
            snapshot(
                '# Старое\n\n{% include [x](part.md) %}',
                '# Новое\n\nНовое вступление.\n\n{% include [x](part.md) %}',
                '# Previous\n\n{% include [x](part.md) %}',
            ),
        );
        expect(plan.ok).toBe(true);
        if (plan.ok)
            expect(plan.changes.map((c) => c.sourceAfter).join('\n')).toContain(
                'Новое вступление.',
            );
    });
    it('inserts a table row without replacing existing localized rows', () => {
        const before = '# CLI\n\n#|\n|| `get` | Получить ||\n|| `set` | Задать ||\n|#';
        const plan = planUpdate(
            snapshot(
                before,
                before.replace('|#', '|| `edit` | Изменить ||\n|#'),
                '# CLI\n\n#|\n|| `get` | Human get ||\n|| `set` | Human set ||\n|#',
            ),
        );
        expect(plan.ok).toBe(true);
        if (plan.ok) expect(plan.changes[0].sourceAfter).toBe('|| `edit` | Изменить ||');
    });
    it('does not match through a target-only paragraph in a section', () => {
        expect(
            planUpdate(snapshot('# A\n\nСтарое.', '# A\n\nНовое.', '# A\n\nOld.\n\nHuman extra.'))
                .ok,
        ).toBe(false);
    });
    it('keeps conditional content opaque and never moves it across audience boundaries', () => {
        expect(
            planUpdate(
                snapshot(
                    '# A\n\n{% if audience == "internal" %}\nOld\n{% endif %}',
                    '# A\n\n{% if audience == "internal" %}\nNew\n{% endif %}',
                    '# A\n\nPublic only',
                ),
            ).ok,
        ).toBe(false);
    });
    it('does not match conditional links across different audiences', () => {
        const source = extractRawBlocks(
            '# A\n\n{% if audience == "internal" %}\n* [{#T}](chat.md)\n{% endif %}',
        );
        const target = extractRawBlocks(
            '# A\n\n{% if audience == "external" %}\n* [{#T}](chat.md)\n{% endif %}',
        );
        expect(correspond(source, target).has(1)).toBe(false);
    });
    it('inserts a language-neutral conditional link at a mapped boundary', async () => {
        const before = '# Issue\n\n* [{#T}](old.md)\n\n[*key]: definition';
        const added = '{% if distr != "on-prem" %}\n* [{#T}](chat.md)\n{% endif %}';
        const after = before.replace('\n\n[*key]', `\n${added}\n\n[*key]`);
        const target = '# Issue\n\n* [{#T}](old.md)\n\n[*key]: Human definition';
        const result = await runUpdate(snapshot(before, after, target), async () => {
            throw Error('A structural link needs no model');
        });
        expect(result.output).toBe(
            '# Issue\n\n* [{#T}](old.md)\n\n' + added + '\n\n[*key]: Human definition',
        );
        expect(result.applied).toBe(1);
        expect(result.rejected).toBe(0);
    });
    it('finds the boundary among several placeholder links with distinct destinations', async () => {
        const before =
            '# Issue\n\n* [{#T}](ticket-links.md)\n* [{#T}](attach-file.md)\n* [{#T}](move-ticket.md)\n\n[*key]: {% include notitle [issue-key](glossary.md#issue-key) %}\n\n{% include [image-style](image.md) %}';
        const added = '{% if distr != "on-prem" %}\n* [{#T}](chat.md)\n{% endif %}';
        const after = before.replace('move-ticket.md)\n\n', `move-ticket.md)\n${added}\n\n`);
        const target =
            '# Issue\n\n* [{#T}](ticket-links.md)\n* [{#T}](attach-file.md)\n* [{#T}](move-ticket.md)\n\n{% include [image-style](image.md) %}';
        const result = await runUpdate(snapshot(before, after, target), async () => {
            throw Error('A structural link needs no model');
        });
        expect(result.output).toContain(added);
        expect(result.applied).toBe(1);
        expect(result.rejected).toBe(0);
    });
    it('recognizes an already translated conditional with the same unique link', async () => {
        const before = '# Plugins\n\nIntro.\n\nNext paragraph.';
        const addition =
            "{% if audience == 'internal' %}Русский [Слоты](https://example.test/slots).{% endif %}";
        const after = before.replace('Intro.\n\n', `Intro.\n\n${addition}\n\n`);
        const target =
            "# Plugins\n\nIntroduction.\n\n{% if audience == 'internal' %}English [Slots](https://example.test/slots).{% endif %}\n\nHuman next paragraph.";
        const result = await runUpdate(snapshot(before, after, target), async () => {
            throw Error('Already translated content needs no model');
        });
        expect(result.output).toBe(target);
        expect(result.rejected).toBe(0);
        expect(result.applied).toBe(0);
    });
    it('does not count an existing conditional as a newly applied duplicate', () => {
        const conditional = '{% if audience == "internal" %}\n* [{#T}](chat.md)\n{% endif %}';
        const before = `# A\n\n${conditional}\n\nNext paragraph.`;
        const after = `# A\n\n${conditional}\n\n${conditional}\n\nNext paragraph.`;
        const target = `# A\n\n${conditional}\n\nHuman next paragraph.`;
        const plan = planUpdate(snapshot(before, after, target));
        expect(plan.ok && plan.changes.length === 0).toBe(false);
    });
    it('rejects a new conditional containing prose without a matching target block', () => {
        const before = '# Plugins\n\nIntro.\n\nNext paragraph.';
        const after = before.replace(
            'Intro.\n\n',
            "Intro.\n\n{% if audience == 'internal' %}Русский текст.{% endif %}\n\n",
        );
        expect(
            planUpdate(snapshot(before, after, '# Plugins\n\nIntroduction.\n\nNext paragraph.')).ok,
        ).toBe(false);
    });
});

it('updates exact metadata scalars and include paths while retaining localized values', async () => {
    const before =
        '---\ntitle: Русский\nurl: /ru/old\nauthor: Автор\n---\n{% include [Русский](old.md) %}';
    const after = before.replace('/ru/old', '/ru/new').replace('(old.md)', '(new.md)');
    const target =
        '---\ntitle: English\nurl: /ru/old\nauthor: Human Author\n---\n{% include [English](old.md) %}';
    let requests = 0;
    const result = await runUpdate(snapshot(before, after, target), async () => {
        requests++;
        throw Error('Raw changes need no model');
    });
    expect(result.output).toBe(
        target.replace('/ru/old', '/ru/new').replace('(old.md)', '(new.md)'),
    );
    expect(requests).toBe(0);
});

it('keeps a useful title update when a separate paragraph has a target-only explanation', async () => {
    const result = await runUpdate(
        snapshot(
            '# Старое\n\nСтарое `x`.',
            '# Новое\n\nНовое `x`.',
            '# Old\n\nOld `x`. Human explanation.',
        ),
        async () => ({text: '# New', diagnostics: []}),
    );
    expect(result.output).toBe('# New\n\nOld `x`. Human explanation.');
    expect(result.applied).toBe(1);
    expect(result.rejected).toBe(1);
    expect(result.diagnostics[0].code).toBe('target_alignment_conflict');
});

it('applies only changed link destinations even when target link order differs', async () => {
    const before = '# Guide\n\nSee [API](old.md) and [Help](help.md).';
    const after = before.replace('(old.md)', '(new.md)');
    const target = '# Guide\n\nHuman text: [Help](help.md), then [API](old.md).';
    const result = await runUpdate(snapshot(before, after, target), async () => {
        throw Error('No model needed');
    });
    expect(result.output).toBe(target.replace('(old.md)', '(new.md)'));
    expect(result.applied).toBe(1);
});

it('does not change a destination that has independently diverged in the target', async () => {
    const result = await runUpdate(
        snapshot('# A\n\n[API](old.md)', '# A\n\n[API](new.md)', '# A\n\n[API](human.md)'),
        async () => {
            throw Error('Must not request translation');
        },
    );
    expect(result.output).toBeNull();
    expect(result.rejected).toBe(1);
});

it('never partially inserts a container around existing translated content', async () => {
    const result = await runUpdate(
        snapshot(
            '# A\n\nText',
            '# A\n\n{% cut "Title" %}\n\nText\n\n{% endcut %}',
            '# A\n\nTranslation',
        ),
        async ({sourceAfter}) => ({text: sourceAfter, diagnostics: []}),
    );
    expect(result.output).toBeNull();
});

it('retains an entire removed container when it has unmatched target content', async () => {
    const before = '# A\n\n{% cut "Title" %}\n\nText\n\n{% endcut %}';
    const target = '# A\n\n{% cut "Title" %}\n\nTranslation\n\nHuman extra\n\n{% endcut %}';
    const result = await runUpdate(snapshot(before, '# A', target), async ({sourceAfter}) => ({
        text: sourceAfter,
        diagnostics: [],
    }));
    expect(result.output).toBeNull();
});

it('does not let a shared code token override contradictory section IDs', async () => {
    const before = '# Main\n\n## Old `cli` {#source}\n\nOld paragraph';
    const result = await runUpdate(
        snapshot(
            before,
            before.replace('## Old', '## New'),
            '# Main\n\n## Human-only `cli` {#different}\n\nHuman paragraph',
        ),
        async ({sourceAfter}) => ({text: sourceAfter, diagnostics: []}),
    );
    expect(result.output).toBeNull();
});

it('does not apply a metadata edit at a different scalar path', async () => {
    const before = '---\nfirst:\n  enabled: false\nsecond:\n  enabled: true\n---\n# Main';
    const target = '---\nfirst:\n  enabled: true\nsecond:\n  enabled: false\n---\n# Main';
    const result = await runUpdate(
        snapshot(before, before.replace('enabled: false', 'enabled: true'), target),
        async () => {
            throw Error('No translation');
        },
    );
    expect(result.output).toBeNull();
});

it('recognizes an already applied link delta without rewriting translated prose', async () => {
    const target = '# A\n\nHuman [API](new.md).';
    const result = await runUpdate(
        snapshot('# A\n\n[API](old.md).', '# A\n\n[API](new.md).', target),
        async () => {
            throw Error('No model');
        },
    );
    expect(result.output).toBe(target);
    expect(result.rejected).toBe(0);
});

it('rejects overlapping old and new link destinations rather than applying a delta twice', async () => {
    const result = await runUpdate(
        snapshot(
            '# A\n\n[A](a.md) [B](b.md)',
            '# A\n\n[A](b.md) [B](c.md)',
            '# A\n\n[A](b.md) [B](c.md)',
        ),
        async () => {
            throw Error('No model');
        },
    );
    expect(result.output).toBeNull();
});
