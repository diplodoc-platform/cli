import {describe, it} from 'vitest';
import {dedent} from 'ts-dedent';

import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

function test(_description: string) {
    it('internal', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/regression');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '-j2 --keep-not-var --add-system-meta',
        });
        await TestAdapter.testBuildPass(outputPath, outputPath + '-html', {
            md2md: false,
            md2html: true,
            args: '-j2',
        });
        await TestAdapter.testBuildPass(outputPath, outputPath + '-static-html', {
            md2md: false,
            md2html: true,
            args: '-j2 --static-content',
        });
        await compareDirectories(outputPath);
        await compareDirectories(outputPath + '-html');
        // await compareDirectories(outputPath + '-static-html');
    });
}

describe('Regression', () => {
    test(dedent`
        - not_var liquid syntax
        - normalize leading hrefs
        - empty href in toc item
    `);
});
