import {expect, it, vi} from 'vitest';

import {normalizePath} from '~/core/utils';
import {MarkdownItConstructor} from '~/core/markdown/parser';

import {setupRun} from './__tests__';
import {
    hasPaddedIncludeParagraph,
    indexPaddedIncludeParagraphs,
    inspectFootnoteSyntax,
} from './footnote-inspection';

it.each([
    ['unused definition', '[^x]: Body.', true],
    ['forward reference', 'Reference[^x].\n\n[^x]: Body.', true],
    ['backward reference', '[^x]: Body.\n\nReference[^x].', true],
    ['unknown reference', 'Unknown[^missing].', false],
    ['fenced code', '```\n[^x]: Literal\n```', false],
    ['escaped definition', '\\[^x]: Literal', false],
    ['inline code', '`[^x]: Literal`', false],
    ['note body', '{% note info %}\n\n[^x]: Body.\n\n{% endnote %}', true],
    ['cut body', '{% cut "More" %}\n\n[^x]: Body.\n\n{% endcut %}', true],
    ['tabs body', '{% list tabs %}\n\n- First\n\n  [^x]: Body.\n\n{% endlist %}', true],
])('inspects canonical grammar: %s', (_name, source, expected) => {
    const run = setupRun({
        langs: ['en'],
        idGenerator: 'constant',
        content: {maxInlineSvgSize: 1024},
    });
    const config = run['transformConfig'](normalizePath('en/probe.md'), {});
    const generateID = vi.fn(() => 'real-generator');
    config.generateID = generateID;
    const warning = vi.spyOn(run.logger, 'warn');
    expect(inspectFootnoteSyntax(source, config)).toBe(expected);
    expect(generateID).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
});

it('does not alter an existing configured parser or allocate its generator', async () => {
    const {default: transformer} = await import('@diplodoc/transform/parser');
    const {configureTransform} = await import('./transform-configuration');
    const {getBaseMdItPlugins} = await import('./features/output-html/utils');
    const run = setupRun({
        langs: ['en'],
        idGenerator: 'constant',
        content: {maxInlineSvgSize: 1024},
    });
    const config = run['transformConfig'](normalizePath('en/probe.md'), {});
    const generateID = vi.fn(() => 'real-generator');
    config.generateID = generateID;
    config.plugins = getBaseMdItPlugins();
    const parser = transformer(configureTransform({...config, files: {}, titles: {}, assets: {}}));
    const doc = parser.parseDocument('Root[^x].\n\n[^x]: Body.');
    const before = parser.compileDocument(doc);
    expect(generateID).toHaveBeenCalledTimes(1);
    const env = doc.env;
    const meta = JSON.stringify(env.meta);
    expect(inspectFootnoteSyntax('[^unused]: Inspection body.', config)).toBe(true);
    expect(generateID).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(env.meta)).toBe(meta);
    expect(parser.compileDocument(doc)).toBe(before);
    expect(generateID).toHaveBeenCalledTimes(1);
});

it('does not run custom core hooks or alter subsequent tabs output', async () => {
    const {default: transformer} = await import('@diplodoc/transform/parser');
    const {configureTransform} = await import('./transform-configuration');
    const {getBaseMdItPlugins} = await import('./features/output-html/utils');
    const run = setupRun({
        langs: ['en'],
        idGenerator: 'constant',
        content: {maxInlineSvgSize: 1024},
    });
    const config = run['transformConfig'](normalizePath('en/probe.md'), {});
    const customCore = vi.fn();
    config.plugins = [
        ...getBaseMdItPlugins(),
        (md) => md.core.ruler.push('external_test', customCore),
    ];
    const parser = transformer(configureTransform({...config, files: {}, titles: {}, assets: {}}));
    const tabs = '{% list tabs %}\n\n- First\n\n  Body\n\n- First\n\n  Other\n\n{% endlist %}';
    const before = parser.compileDocument(parser.parseDocument(tabs));
    const calledBefore = customCore.mock.calls.length;
    expect(inspectFootnoteSyntax(tabs + '\n\n[^unused]: Footnote.', config)).toBe(true);
    expect(customCore).toHaveBeenCalledTimes(calledBefore);
    const after = parser.compileDocument(parser.parseDocument(tabs));
    expect(after).toBe(before);
    expect(customCore).toHaveBeenCalledTimes(calledBefore + 1);
});

it.each([
    ['\u00a0{% include [part](part.md) %}', true],
    ['> \u00a0{% include [part](part.md) %}', true],
    ['- \u00a0{% include [part](part.md) %}', true],
    ['> - \u00a0\n>   {% include [part](part.md) %}', true],
    ['{% include [part](part.md) %}\r\n\u00a0', true],
    ['{% include [part](part.md) %}\r\u00a0', true],
    ['\ufeff{% include [part](part.md) %}', true],
    [' {% include [part](part.md) %} ', false],
    ['\u0000{% include [part](part.md) %}', false],
    ['\u200b{% include [part](part.md) %}', false],
    ['```\n\u00a0{% include [part](part.md) %}\n```', false],
    ['    \u00a0{% include [part](part.md) %}', false],
    ['Before \u00a0{% include [part](part.md) %}', false],
])('indexes only native padded include paragraphs: %j', (source, expected) => {
    const run = setupRun({langs: ['en'], content: {maxInlineSvgSize: 1024}});
    const result = run.inspectMergeSource(source, normalizePath('en/probe.md'));
    expect(result.paddedIncludeParagraphs.length > 0).toBe(expected);
    for (const paragraph of result.paddedIncludeParagraphs) {
        const start = source.indexOf(paragraph.marker);
        expect(start).toBeGreaterThanOrEqual(paragraph.start);
        expect(start + paragraph.marker.length).toBeLessThanOrEqual(paragraph.end);
    }
});

it('keeps repeated marker and fragment ownership in original UTF-16 coordinates', () => {
    const plain = '{% include [part](part.md#one) %}';
    const other = '{% include [part](part.md#two) %}';
    const source = '\ufeff' + plain + '\r\n\r\n' + plain + '\r\r\u00a0' + other;
    const tokens = new MarkdownItConstructor().parse(source, {});
    const paragraphs = indexPaddedIncludeParagraphs(source, tokens);
    const first = source.indexOf(plain);
    const second = source.indexOf(plain, first + 1);
    const third = source.indexOf(other);
    expect(hasPaddedIncludeParagraph(paragraphs, [first, first + plain.length], plain)).toBe(true);
    expect(hasPaddedIncludeParagraph(paragraphs, [second, second + plain.length], plain)).toBe(
        false,
    );
    expect(hasPaddedIncludeParagraph(paragraphs, [third, third + other.length], other)).toBe(true);
    expect(hasPaddedIncludeParagraph(paragraphs, [third, third + other.length], plain)).toBe(false);
    expect(hasPaddedIncludeParagraph(paragraphs, [third, source.length + 1], other)).toBe(false);
});

it('does not authorize normalized marker contents or invalid and overlapping maps', () => {
    const marker = '{% include [part](part.md) %}';
    const source = '\u00a0' + marker + '\n\n\u00a0' + marker;
    const tokens = new MarkdownItConstructor().parse(source, {});
    const opens = tokens.filter((token) => token.type === 'paragraph_open');
    opens[1].map = opens[0].map;
    expect(indexPaddedIncludeParagraphs(source, tokens)).toEqual([]);
    opens[0].map = [-1, 1];
    opens[1].map = [0, 100];
    expect(indexPaddedIncludeParagraphs(source, tokens)).toEqual([]);

    const raw = '\u00a0{% include [part](part\u0000.md) %}';
    const paragraphs = indexPaddedIncludeParagraphs(
        raw,
        new MarkdownItConstructor().parse(raw, {}),
    );
    expect(hasPaddedIncludeParagraph(paragraphs, [1, raw.length], raw.slice(1))).toBe(false);
});

it('bounds index construction and lookup work for N and 2N paragraphs', () => {
    const marker = '{% include [part](part.md) %}';
    const counts = [32, 64].map((count) => {
        const source = ('\u00a0' + marker + '\n\n').repeat(count);
        let reads = 0;
        const tokens = new Proxy(new MarkdownItConstructor().parse(source, {}), {
            get(target, key, receiver) {
                if (typeof key === 'string' && /^\d+$/.test(key)) reads++;
                return Reflect.get(target, key, receiver);
            },
        });
        const paragraphs = indexPaddedIncludeParagraphs(source, tokens);
        expect(paragraphs).toHaveLength(count);
        const indexReads = reads;
        reads = 0;
        const index = new Proxy(paragraphs, {
            get(target, key, receiver) {
                if (typeof key === 'string' && /^\d+$/.test(key)) reads++;
                return Reflect.get(target, key, receiver);
            },
        });
        for (const paragraph of paragraphs) {
            const start = source.indexOf(marker, paragraph.start);
            expect(hasPaddedIncludeParagraph(index, [start, start + marker.length], marker)).toBe(
                true,
            );
        }
        expect(reads).toBeLessThanOrEqual(count * (Math.ceil(Math.log2(count)) + 2));
        return indexReads;
    });
    expect(counts[1]).toBeLessThanOrEqual(counts[0] * 2 + 6);
});
