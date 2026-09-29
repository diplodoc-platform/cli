import {expect, it} from 'vitest';

import {codeUnitIds} from './unit-context';

it('finds code units across fence styles and containers without marking prose', () => {
    const source = [
        'Prose and `inline`',
        '',
        '> ```sh',
        '> # comment',
        '> ```',
        '',
        '~~~mermaid',
        'flowchart LR',
        'A[Label]',
        '~~~',
        '',
        '    Indented code',
    ].join('\n');
    const skeleton = source
        .replace('Prose', '%%%0%%%')
        .replace('inline', '%%%4%%%')
        .replace('comment', '%%%1%%%')
        .replace('Label', '%%%2%%%')
        .replace('Indented code', '%%%3%%%');

    expect([...codeUnitIds(source, skeleton)].sort()).toEqual([1, 2, 3]);
});

it('distinguishes a literal marker from a generated marker in the same fence', () => {
    const source = 'Plain text.\n\n```sh\n# Комментарий\n%%%0%%%\n```\n';
    const skeleton = '%%%0%%%\n\n```sh\n# %%%1%%%\n%%%0%%%\n```\n';

    expect([...codeUnitIds(source, skeleton)]).toEqual([1]);
});
