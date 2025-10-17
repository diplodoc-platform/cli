import type {ConstructorBlock} from '@diplodoc/page-constructor-extension';

import {describe, expect, it} from 'vitest';

import {findPcImages, getPcIconTitle, parsePcBlocks} from './utils';

describe('parsePcBlocks', () => {
    it('should find icon and image in flat array', () => {
        const input = [{icon: 'foo.svg', title: 'a'}, {image: 'bar.png'}] as ConstructorBlock[];

        const images = parsePcBlocks(input, []);

        expect(images).toEqual(['foo.svg', 'bar.png']);
    });

    it('should find icon in children recursively', () => {
        const input = [{children: [{icon: 'inner.svg'}]}] as ConstructorBlock[];

        const images = parsePcBlocks(input, []);

        expect(images).toEqual(['inner.svg']);
    });

    it('should find images in deeply nested arrays', () => {
        const input = [
            {
                items: [
                    {buttons: [{image: 'a.jpg', children: [{icon: 'z.svg'}]}, {img: 'b.gif'}]},
                    {logo: 'logo.webp'},
                ],
            },
        ] as ConstructorBlock[];

        const images = parsePcBlocks(input, []);

        expect(images).toEqual(['a.jpg', 'z.svg', 'b.gif', 'logo.webp']);
    });

    it('should find images in device/theme branches', () => {
        const input = [
            {
                background: {
                    light: {
                        image: {
                            desktop: 'light-desktop.svg',
                            mobile: 'light-mobile.svg',
                        },
                    },
                    dark: {
                        image: {
                            desktop: 'dark-desktop.svg',
                        },
                    },
                },
            },
        ] as unknown as ConstructorBlock[];

        const images = parsePcBlocks(input, []);

        expect(images).toEqual(['light-desktop.svg', 'light-mobile.svg', 'dark-desktop.svg']);
    });

    it('should find img as string and as data prop', () => {
        const input = [
            {img: 'plain.svg'},
            {img: {data: 'nested.png'}},
        ] as unknown as ConstructorBlock[];

        const images = parsePcBlocks(input, []);

        expect(images).toEqual(['plain.svg', 'nested.png']);
    });

    it('should ignore non-media strings and numbers', () => {
        const input = [
            {text: 'Text with foo.svg inside', url: '/docs', count: 10},
            {notImage: 'just_a_string'},
        ] as unknown as ConstructorBlock[];

        expect(parsePcBlocks(input, [])).toEqual([]);
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
                    - buttons:
                        - img: icon1.png
                        - img: inner-folder/btn.svg
            :::
        `;

        const results = findPcImages(content);

        expect(results.map((a) => a.path)).toEqual([
            'rocket.svg',
            'icon1.png',
            'inner-folder/btn.svg',
        ]);
    });

    it('should find device/theme nested images', () => {
        const content = `
            ::: page-constructor
                blocks:
                - background:
                    light:
                        image:
                            desktop: bg-light-d.svg
                            mobile: bg-light-m.svg
                    dark:
                        image:
                            desktop: bg-dark-d.svg
            :::
        `;

        const results = findPcImages(content);

        expect(results.map((a) => a.path)).toEqual([
            'bg-light-d.svg',
            'bg-light-m.svg',
            'bg-dark-d.svg',
        ]);
    });

    it('should ignore images in text and non-media', () => {
        const content = `
            ::: page-constructor
                blocks:
                - text: "Text ![](image-in-text.svg)"
                - title: "Title ![](icon.svg)"
                - url: "/docs/page"
                - description: "Description bar.png"
            :::
        `;

        expect(findPcImages(content)).toEqual([]);
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
