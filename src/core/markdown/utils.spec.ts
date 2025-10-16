import {describe, expect, it} from 'vitest';

import {findPcImages, getPcIconTitle, parsePcBlocks} from './utils';

describe('parsePcBlocks', () => {
    it('should find icon and image in flat array', () => {
        const input = [{icon: 'foo.svg', title: 'a'}, {image: 'bar.png'}];

        const images = parsePcBlocks(input, []);

        expect(images).toEqual(['foo.svg', 'bar.png']);
    });

    it('should find icon in children recursively', () => {
        const input = [
            {
                children: [{icon: 'inner.svg'}],
            },
        ];

        const images = parsePcBlocks(input, []);

        expect(images).toEqual(['inner.svg']);
    });

    it('should work with empty blocks', () => {
        expect(parsePcBlocks([], [])).toEqual([]);
    });
});

describe('getPcIconTitle', () => {
    it('should extract name from path', () => {
        expect(getPcIconTitle('_images/foo.svg')).toBe('foo');
        expect(getPcIconTitle('folder/layout-header-cells.svg')).toBe('layout-header-cells');
        expect(getPcIconTitle('/full/path/rocket.png')).toBe('rocket');
        expect(getPcIconTitle('rocket')).toBe('rocket');
    });
});

describe('findPcImages', () => {
    it('should find images from simple page-constructor block', () => {
        const content = `
            ::: page-constructor
                blocks:
                - icon: foo.svg
                - image: bar.png
            :::
        `;

        const results = findPcImages(content);

        expect(results.map((a) => a.path)).toEqual(['foo.svg', 'bar.png']);
    });

    it('should find recursively', () => {
        const content = `
            ::: page-constructor
                blocks:
                - children:
                    - icon: rocket.svg
            :::
        `;

        const results = findPcImages(content);

        expect(results.map((a) => a.path)).toContain('rocket.svg');
    });

    it('should handle broken yaml gracefully', () => {
        const content = `
            ::: page-constructor
                blocks:
                - : not YAML
            :::
        `;

        expect(() => findPcImages(content)).not.toThrow();
        expect(findPcImages(content)).toEqual([]);
    });

    it('should work if no page-constructor block', () => {
        const content = `some text`;

        expect(findPcImages(content)).toEqual([]);
    });

    it('should set AssetInfo fields correctly', () => {
        const content = `
            ::: page-constructor
                blocks:
                - icon: great.svg
            :::
        `;

        const [asset] = findPcImages(content);

        expect(asset.path).toBe('great.svg');
        expect(asset.type).toBe('image');
        expect(asset.subtype).toBe('image');
        expect(asset.title).toBe('great');
        expect(asset.autotitle).toBe(false);
        expect(asset.hash).toBeNull();
        expect(asset.search).toBeNull();
    });
});
