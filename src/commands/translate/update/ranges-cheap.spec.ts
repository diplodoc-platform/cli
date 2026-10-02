import {expect, it} from 'vitest';

import {extractRawBlocks} from './ranges';

it('keeps a five-space list fence and its closing line in one opaque range', () => {
    const text = '1. Run:\n\n     ```bash\n     echo ok\n     ```\n\nNext paragraph.';
    const blocks = extractRawBlocks(text);
    expect(blocks.map(({kind}) => kind)).toEqual(['list', 'opaque', 'paragraph']);
    expect(blocks[1]).toMatchObject({
        start: 9,
        end: 43,
        text: '     ```bash\n     echo ok\n     ```',
    });
});

it('does not swallow prose and headings after an inline triple-backtick span', () => {
    const blocks = extractRawBlocks(
        '```Found unrecognized options```\n\nNext paragraph.\n\n## Next heading\n\nAnother paragraph.',
    );
    expect(blocks.map(({kind}) => kind)).toEqual([
        'paragraph',
        'paragraph',
        'heading',
        'paragraph',
    ]);
    expect(blocks[0].text).toBe('```Found unrecognized options```');
});

it.each([
    ['unclosed fence', '```bash\necho ok\n\n## Still code', '```bash\necho ok\n\n## Still code'],
    [
        'shorter closing fence',
        '````bash\necho ok\n```\n## Still code\n````\n\nAfter.',
        '````bash\necho ok\n```\n## Still code\n````',
    ],
    [
        'different closing character',
        '```bash\necho ok\n~~~\n## Still code\n```\n\nAfter.',
        '```bash\necho ok\n~~~\n## Still code\n```',
    ],
    [
        'over-indented closing line',
        '```bash\necho ok\n    ```\n## Still code\n```\n\nAfter.',
        '```bash\necho ok\n    ```\n## Still code\n```',
    ],
    ['tilde fence with backtick info', '~~~a`b\necho ok\n~~~~\n\nAfter.', '~~~a`b\necho ok\n~~~~'],
])('keeps %s opaque through the actual closing boundary', (_name, text, expected) => {
    const block = extractRawBlocks(text)[0];
    expect(block.kind).toBe('opaque');
    expect(block.text).toBe(expected);
    expect(text.slice(block.start, block.end)).toBe(expected);
});

it('does not interpret standalone five-space code as a list fence', () => {
    const blocks = extractRawBlocks('     ```bash\n     echo ok\n     ```\n\nAfter.');
    expect(blocks.map(({text}) => text)).toEqual([
        '     ```bash\n     echo ok',
        '     ```',
        'After.',
    ]);
    expect(blocks.every(({kind}) => kind === 'opaque' || kind === 'paragraph')).toBe(true);
});

it('keeps ordinary indented code and inline spans separate from later prose', () => {
    const blocks = extractRawBlocks(
        '    echo `ok`\n    echo again\n\nUse ```a``` and `b`.\n\n## Heading',
    );
    expect(blocks.map(({kind}) => kind)).toEqual(['opaque', 'paragraph', 'heading']);
    expect(blocks[0].text).toBe('    echo `ok`\n    echo again');
});

it('ends an unclosed list fence at the dedented parent boundary', () => {
    const blocks = extractRawBlocks('1. Run:\n\n     ```bash\n     echo ok\n\nOutside.');
    expect(blocks.map(({kind}) => kind)).toEqual(['list', 'opaque', 'paragraph']);
    expect(blocks[1].text).toBe('     ```bash\n     echo ok\n');
    expect(blocks[2].text).toBe('Outside.');
});

it.each(['\n', '\r\n', '\r'])('preserves Unicode and raw offsets with %j line endings', (eol) => {
    const text = [
        '# Заголовок 🦕',
        '',
        '1. Шаг:',
        '',
        '     ```bash',
        '     echo ё 🦕',
        '     ```',
        '',
        'Дальше.',
    ].join(eol);
    const blocks = extractRawBlocks(text);
    expect(blocks.map(({kind}) => kind)).toEqual(['heading', 'list', 'opaque', 'paragraph']);
    expect(blocks[2].text).toBe(['     ```bash', '     echo ё 🦕', '     ```'].join(eol));
    for (const block of blocks) {
        expect(Buffer.from(text.slice(block.start, block.end))).toEqual(Buffer.from(block.text));
    }
    expect(blocks[2].start).toBe(text.indexOf('     ```bash'));
    expect(blocks[3].start).toBe(text.indexOf('Дальше.'));
});

it('keeps audience branches opaque without crossing into subsequent prose', () => {
    const branch =
        '{% if audience == "internal" %}\n1. Run:\n\n     ```bash\n     echo ok\n     ```\n{% else %}\n```inline```\n{% endif %}';
    const blocks = extractRawBlocks(branch + '\n\nOutside.');
    expect(blocks.map(({kind}) => kind)).toEqual(['opaque', 'paragraph']);
    expect(blocks[0].text).toBe(branch);
    expect(blocks[1].text).toBe('Outside.');
});

it('keeps note container identity around nested list fences', () => {
    const blocks = extractRawBlocks(
        '{% note info %}\n\n1. Run:\n\n     ```bash\n     echo ok\n     ```\n\n{% endnote %}\n\nOutside.',
    );
    expect(blocks.map(({kind}) => kind)).toEqual([
        'marker',
        'list',
        'opaque',
        'marker',
        'paragraph',
    ]);
    expect(blocks[2].container).toEqual(['note:info']);
    expect(blocks[4].container).toEqual([]);
});
