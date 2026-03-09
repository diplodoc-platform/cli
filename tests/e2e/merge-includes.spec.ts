import {existsSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, test} from 'vitest';

import {TestAdapter, getTestPaths} from '../fixtures';

describe('Merge includes (md2md)', () => {
    test('basic: include directive preserved and included block appended', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/basic');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });

        const mainMd = readFileSync(resolve(outputPath, 'main.md'), 'utf8');

        expect(mainMd).toContain('{% include [simple-include](_includes/simple.md) %}');
        expect(mainMd).toContain('{% included (_includes/simple.md) %}');
        expect(mainMd).toContain('## Included Section');
        expect(mainMd).toContain('This is the included content.');
        expect(mainMd).toContain('{% endincluded %}');
    });

    test('basic: separate include files are NOT written', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/basic');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });

        expect(existsSync(resolve(outputPath, '_includes/simple.md'))).toBe(false);
    });

    test('nested: flat included blocks with colon-chain keys', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/nested');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });

        const mainMd = readFileSync(resolve(outputPath, 'main.md'), 'utf8');

        expect(mainMd).toContain('{% include [outer](_includes/outer.md) %}');

        expect(mainMd).toContain('{% included (_includes/outer.md) %}');
        expect(mainMd).toContain('## Outer Section');
        expect(mainMd).toContain('Content from outer include.');

        expect(mainMd).toContain('{% included (_includes/outer.md:inner.md) %}');
        expect(mainMd).toContain('### Inner Section');
        expect(mainMd).toContain('Content from inner include.');

        expect(existsSync(resolve(outputPath, '_includes/outer.md'))).toBe(false);
        expect(existsSync(resolve(outputPath, '_includes/inner.md'))).toBe(false);
    });

    test('relative-paths: links in included content preserve original paths', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/relative-paths');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });

        const mainMd = readFileSync(resolve(outputPath, 'main.md'), 'utf8');

        expect(mainMd).toContain('{% included (_includes/sub/with-links.md) %}');

        // Paths stay original — transform pipeline resolves them
        // relative to the source file via the colon-chain key
        expect(mainMd).toContain('../guide.md');
        expect(mainMd).toContain('./images/diagram.png');
        expect(mainMd).toContain('../reference.md');

        expect(existsSync(resolve(outputPath, '_includes/sub/with-links.md'))).toBe(false);
    });

    test('without flag: includes are NOT merged', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/basic');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--no-merge-includes',
        });

        const mainMd = readFileSync(resolve(outputPath, 'main.md'), 'utf8');

        expect(mainMd).toContain('{% include');
        expect(mainMd).not.toContain('{% included');
        expect(mainMd).not.toContain('## Included Section');
    });
});
