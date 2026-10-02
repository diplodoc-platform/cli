import {readFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

describe('Local search', () => {
    it('internal', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/search');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: false,
            md2html: true,
            args: '-j2 --search --interface-toc',
        });
        await compareDirectories(outputPath);
    });

    it('excludes hidden pages with search.hiddenPolicy', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/search-hidden-policy');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: false,
            md2html: true,
            args: '',
        });

        const read = (file: string) => readFile(join(outputPath, file), 'utf8');
        const [index, publicPage, hidden, section, nested, indexed] = await Promise.all([
            read('index.html'),
            read('public.html'),
            read('hidden.html'),
            read('section.html'),
            read('nested.html'),
            read('indexed.html'),
        ]);

        expect(index).not.toContain('"noIndex":true');
        expect(publicPage).not.toContain('"noIndex":true');
        expect(hidden).toContain('"noIndex":true');
        expect(section).toContain('"noIndex":true');
        expect(nested).toContain('"noIndex":true');
        expect(indexed).not.toContain('"noIndex":true');

        const searchDir = join(outputPath, '_search', 'en');
        const registry = (await readdir(searchDir)).find((file) => file.includes('registry'));

        expect(registry).toBeDefined();

        const registryContent = await read(join('_search', 'en', registry as string));

        expect(registryContent).toContain('Public content');
        expect(registryContent).toContain('Indexed content');
        expect(registryContent).not.toContain('Hidden content');
        expect(registryContent).not.toContain('Section content');
        expect(registryContent).not.toContain('Nested content');
    });
});
