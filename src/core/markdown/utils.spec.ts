import type {ConstructorBlock} from '@diplodoc/page-constructor-extension';
import type {Location} from './types';

import {describe, expect, it} from 'vitest';

import {
    filterRanges,
    findFileBlocks,
    findIncludedBlockRanges,
    findPcImages,
    getPcIconTitle,
    parsePcBlocks,
} from './utils';

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

        expect(images).toEqual(['a.jpg', 'z.svg', 'logo.webp']);
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

    it('should find image as string but not as data prop', () => {
        const input = [
            {image: 'plain.svg'},
            {image: {data: 'nested.png'}},
        ] as unknown as ConstructorBlock[];

        const images = parsePcBlocks(input, []);

        expect(images).toEqual(['plain.svg']);
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
                        - previewImg: icon1.png
                        - avatar: inner-folder/btn.svg
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

    it('should not break on ::: inside YAML string value', () => {
        const content = `
            ::: page-constructor
                blocks:
                - icon: a.svg
                - title: "Text ::: inside"
                - light:
                    image: b.png
                - dark:
                    image: c.jpeg
            :::
        `;

        const results = findPcImages(content);

        expect(results.map((a) => a.path)).toEqual(['a.svg', 'b.png', 'c.jpeg']);
    });

    it('should skip ::: inline (not at line start) as closing', () => {
        const content = `
            ::: page-constructor
                blocks:
                - icon: hello.svg
                - text: "Some text
                  in markdown with inline ::: inside"
                - url: test.png
            :::
        `;

        const results = findPcImages(content);

        expect(results.map((a) => a.path)).toEqual(['hello.svg', 'test.png']);
    });

    it('should not match closing ::: with different indent', () => {
        const content = `
            ::: page-constructor
                blocks:
                - icon: a.svg
             :::
        `;

        expect(findPcImages(content)).toEqual([]);
    });

    it('should allow windows-style line endings', () => {
        const content = '::: page-constructor\r\nblocks:\r\n  - icon: a.svg\r\n:::\r\n';
        const results = findPcImages(content);

        expect(results.map((a) => a.path)).toEqual(['a.svg']);
    });

    it('should not catch ::: closing from next block', () => {
        const content = `
            ::: page-constructor
                blocks:
                - icon: foo1.svg
            :::
            ::: page-constructor
                blocks:
                - icon: foo2.svg
            :::
        `;

        const results = findPcImages(content);

        expect(results.map((a) => a.path)).toEqual(['foo1.svg', 'foo2.svg']);
    });

    it('should ignore empty blocks', () => {
        const content = `
            ::: page-constructor
            :::
        `;
        expect(findPcImages(content)).toEqual([]);
    });

    it('should handle deeply indented open/close :::', () => {
        const content = `
                ::: page-constructor
                    blocks:
                    - icon: a.svg
                :::
        `;

        const results = findPcImages(content);

        expect(results.map((a) => a.path)).toEqual(['a.svg']);
    });

    it('should ignore blocks not matching page-constructor', () => {
        const content = `
            ::: other-directive
                blocks:
                - icon: a.svg
            :::
        `;

        expect(findPcImages(content)).toEqual([]);
    });
});

describe('findFileBlocks', () => {
    it('should find a single file block', () => {
        const content = '{% file src="_assets/doc.pdf" name="Document" %}';
        const results = findFileBlocks(content);
        expect(results).toHaveLength(1);
        expect(results[0].path).toBe('_assets/doc.pdf');
    });

    it('should find multiple file blocks', () => {
        const content = [
            'Text {% file src="_assets/a.pdf" name="A" %} more text',
            'Text {% file src="_assets/b.txt" name="B" %} more text',
        ].join('\n');
        const results = findFileBlocks(content);
        expect(results.map((r) => r.path)).toEqual(['_assets/a.pdf', '_assets/b.txt']);
    });

    it('should set AssetInfo fields correctly', () => {
        const content = '{% file src="_assets/doc.pdf" name="Document" %}';
        const [asset] = findFileBlocks(content);
        expect(asset).toMatchObject({
            path: '_assets/doc.pdf',
            type: 'link',
            subtype: null,
            title: '',
            autotitle: false,
            hash: null,
            search: null,
            location: [0, content.length],
        });
    });

    it('should work when src is not the first attribute', () => {
        const content = '{% file name="Document" src="_assets/doc.pdf" %}';
        const results = findFileBlocks(content);
        expect(results).toHaveLength(1);
        expect(results[0].path).toBe('_assets/doc.pdf');
    });

    it('should ignore external URLs', () => {
        const content = '{% file src="https://example.com/doc.pdf" name="External" %}';
        expect(findFileBlocks(content)).toHaveLength(0);
    });

    it('should return empty array when no file blocks', () => {
        expect(findFileBlocks('# Just a heading\n\nSome text.')).toEqual([]);
    });

    it('should return empty array for empty content', () => {
        expect(findFileBlocks('')).toEqual([]);
    });
});

describe('findIncludedBlockRanges', () => {
    it('should find a single included block range', () => {
        const content = '{% included (_includes/file.md) %}\nContent\n{% endincluded %}';
        const ranges = findIncludedBlockRanges(content);
        expect(ranges).toHaveLength(1);
        expect(ranges[0][0]).toBe(0);
        expect(ranges[0][1]).toBe(content.length);
    });

    it('should find multiple included blocks', () => {
        const content = [
            '{% included (_includes/a.md) %}',
            'Content A',
            '{% endincluded %}',
            'Some text between',
            '{% included (_includes/b.md) %}',
            'Content B',
            '{% endincluded %}',
        ].join('\n');
        const ranges = findIncludedBlockRanges(content);
        expect(ranges).toHaveLength(2);
    });

    it('should return empty array when no included blocks', () => {
        const content = '# Normal markdown\n\nSome text.';
        expect(findIncludedBlockRanges(content)).toEqual([]);
    });

    it('should handle included block without matching endincluded', () => {
        const content = '{% included (_includes/file.md) %}\nContent without end';
        const ranges = findIncludedBlockRanges(content);
        expect(ranges).toEqual([]);
    });

    it('should handle colon-chain keys', () => {
        const content = '{% included (_includes/outer.md:inner.md) %}\nNested\n{% endincluded %}';
        const ranges = findIncludedBlockRanges(content);
        expect(ranges).toHaveLength(1);
    });
});

describe('filterRanges', () => {
    it('should filter items fully inside excluded range', () => {
        const excludes: Location[] = [[10, 50]];
        const items = [{location: [15, 30] as Location}];
        expect(filterRanges(excludes, items)).toEqual([]);
    });

    it('should keep items outside excluded range', () => {
        const excludes: Location[] = [[10, 50]];
        const items = [{location: [60, 80] as Location}];
        expect(filterRanges(excludes, items)).toEqual(items);
    });

    it('should filter items overlapping start of excluded range', () => {
        const excludes: Location[] = [[10, 50]];
        const items = [{location: [5, 20] as Location}];
        expect(filterRanges(excludes, items)).toEqual([]);
    });

    it('should filter items overlapping end of excluded range', () => {
        const excludes: Location[] = [[10, 50]];
        const items = [{location: [40, 60] as Location}];
        expect(filterRanges(excludes, items)).toEqual([]);
    });

    it('should handle multiple excludes', () => {
        const excludes: Location[] = [
            [10, 20],
            [30, 40],
        ];
        const items = [
            {location: [5, 8] as Location},
            {location: [12, 18] as Location},
            {location: [25, 28] as Location},
            {location: [35, 38] as Location},
        ];
        const result = filterRanges(excludes, items);
        expect(result).toHaveLength(2);
        expect(result[0].location).toEqual([5, 8]);
        expect(result[1].location).toEqual([25, 28]);
    });

    it('should return all items when no excludes', () => {
        const items = [{location: [5, 10] as Location}, {location: [15, 20] as Location}];
        expect(filterRanges([], items)).toEqual(items);
    });
});
