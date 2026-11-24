import {mkdtemp, readFile, realpath, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect, test} from 'vitest';

import {TestAdapter, getTestPaths} from '../fixtures';

const {inputPath} = getTestPaths('mocks/page-titles');

test.each(['.html URLs', 'extensionless URLs'])(
    'uses page and TOC titles in static HTML with %s',
    async (urlMode) => {
        const root = await realpath(await mkdtemp(join(tmpdir(), 'diplodoc-page-titles-')));
        const output = join(root, 'output');

        try {
            await TestAdapter.testBuildPass(inputPath, output, {
                md2md: false,
                args: urlMode === 'extensionless URLs' ? '--skip-html-extension' : '',
            });

            const titles = {
                'section.html': 'YAML section | Fixture Docs',
                'page.html': 'Markdown page | Fixture Docs',
                'index.html': 'Fixture Docs',
                'explicit.html': 'Explicit title | Fixture Docs',
                'heading.html': 'Markdown heading | Fixture Docs',
                'same-title.html': 'Fixture Docs',
            };

            for (const [filename, title] of Object.entries(titles)) {
                const html = await readFile(join(output, 'ru', filename), 'utf8');
                expect(html.match(/<title>(.*?)<\/title>/s)?.[1], filename).toBe(title);
            }
        } finally {
            await rm(root, {recursive: true, force: true});
        }
    },
);
