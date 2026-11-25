import {describe, expect, it} from 'vitest';

import {
    extractYfm,
    sourceNodes,
    standaloneInclude,
    yfmInlineInventory,
    yfmProse,
} from './yfm-units';

describe('native YFM extraction', () => {
    it('inspects prose under link labels without treating its destination or literals as words', () => {
        const markup =
            'Use [the guide](./part(v2).md), then run `test command` with :no-translate[Exact wording].';

        expect(yfmProse(markup)).toContain('Use the guide');
        expect(yfmProse(markup)).toContain('then run');
        expect(yfmProse(markup)).not.toMatch(/part|test command|Exact wording/);
        expect(yfmProse('```sh\ntranslate-me\n```')).toBe('');
    });

    it('preserves YFM variables, auto-links, images and wrapped destinations in the inventory', () => {
        const markup =
            'See ![example](image.png) and [help](:no-translate[guide.md]), or <https://example.com/> using {{ name }}.';
        const inventory = yfmInlineInventory(markup);

        expect(inventory.opaque).toBe(false);
        expect(inventory.verbatimSpans).toContain(':no-translate[guide.md]');
        expect(inventory.protectedText).toEqual(
            expect.arrayContaining([
                expect.stringContaining('image.png'),
                expect.stringContaining('guide.md'),
                expect.stringContaining('https://example.com/'),
                expect.stringContaining('{{ name }}'),
            ]),
        );
    });

    it('does not invent source nodes for a different XLIFF element', () => {
        expect(sourceNodes('<target>Content.</target>')).toEqual([]);
        expect(sourceNodes(extractYfm('Content.').units[0])).toEqual([{'#text': 'Content.'}]);
    });

    it('recognizes valid native includes and lets every other document follow ordinary extraction', () => {
        const include = '{% include notitle [Guide](../guide(v1).md) %}';
        expect(standaloneInclude(include)).toBe(include);
        expect(standaloneInclude(include + '\nAnother line.')).toBeUndefined();
        expect(standaloneInclude('{% note tip "Guide" %}')).toBeUndefined();
        expect(standaloneInclude('{% include [Guide](../guide(v1).md %}')).toBeUndefined();
    });
});
