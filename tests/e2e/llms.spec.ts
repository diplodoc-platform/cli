import {describe, test} from 'vitest';

import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

describe('llms.txt', () => {
    // Builds the same fixture in both md and html with `--llms` (variant B):
    //   - md  output -> `${outputPath}`      (llms-full.txt has includes merged)
    //   - html output -> `${outputPath}-html` (llms-full.txt keeps include directives)
    // The fixture also has per-page frontmatter descriptions (surfaced in
    // llms.txt) and a `when: showBeta` page that the default version filters
    // out — proving the artifacts stay consistent with the built "version".
    test('generates llms.txt and llms-full.txt for md and html', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/llms');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: true,
            args: '--llms',
        });

        await compareDirectories(outputPath);
        await compareDirectories(`${outputPath}-html`);
    });
});
