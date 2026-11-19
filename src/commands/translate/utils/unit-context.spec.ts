import {expect, it} from 'vitest';

import {codeUnitIds, snapshotInlineLiterals} from './unit-context';

const unit = (text: string) => `<source xml:space="preserve">${text}</source>`;

it('keeps probe identities distinct at local indexes one and ten', () => {
    const values = Array.from({length: 11}, (_, index) => {
        if (index === 1) return 'alpha';
        if (index === 10) return 'omega';
        return `Paragraph ${index}.`;
    });
    const source = values
        .map((value, index) => (index === 1 || index === 10 ? '`' + value + '`' : value))
        .join('\n\n');
    const skeleton = values
        .map((_, index) =>
            index === 1 || index === 10 ? '`%%%' + index + '%%%`' : '%%%' + index + '%%%',
        )
        .join('\n\n');
    expect([...snapshotInlineLiterals(source)(skeleton, values.map(unit))]).toEqual([1, 10]);
});

it('captures nested string leaves before in-place extraction changes them', () => {
    const source = {
        description: '* `limit`',
        nested: [{description: '``pageToken``'}],
        prose: 'limit',
    };
    const context = snapshotInlineLiterals(source);
    source.description = '* `%%%0%%%`';
    source.nested[0].description = '``%%%1%%%``';
    source.prose = '%%%2%%%';
    expect([...context(source, [unit('limit'), unit('pageToken'), unit('limit')])]).toEqual([0, 1]);
});

it('does not freeze a unit that also occurs in unproven prose elsewhere', () => {
    const context = snapshotInlineLiterals({code: '`limit`', prose: 'limit'});
    expect([...context({code: '`%%%0%%%`', prose: '%%%0%%%'}, [unit('limit')])]).toEqual([]);
});

it('does not mistake literal marker text for source ownership', () => {
    const context = snapshotInlineLiterals({code: '`%%%0%%%`', prose: 'limit'});
    expect([...context({code: '`%%%0%%%`', prose: '%%%0%%%'}, [unit('limit')])]).toEqual([]);
});

it.each([
    ['\\`limit\\`', '\\`%%%0%%%\\`', unit('limit')],
    ['`limit`', '`%%%0%%%`', unit('different')],
    ['`limit`', '`%%%99%%%`', unit('limit')],
    ['`limit`', '`%%%0%%%`', 'limit'],
    ['`limit`', '`%%%0%%%`', unit('%%%1%%%')],
])('leaves ambiguous inline ownership unproven: %s', (source, skeleton, text) => {
    expect([...snapshotInlineLiterals(source)(skeleton, [text])]).toEqual([]);
});

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
