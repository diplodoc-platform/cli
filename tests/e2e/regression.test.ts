import {describe, it} from 'vitest';
import {dedent} from 'ts-dedent';
import {compareDirectories, getTestPaths} from '../fixtures';
import {CliTestAdapter} from '../fixtures/cliAdapter';

function test(_description: string) {
    const cliTestAdapter = new CliTestAdapter();

    it('internal', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/regression');

        await cliTestAdapter.testPass(inputPath, outputPath, {md2md: true, md2html: false});
        await cliTestAdapter.testPass(outputPath, outputPath + '-html', {
            md2md: false,
            md2html: true,
        });
        await cliTestAdapter.testPass(outputPath, outputPath + '-static-html', {
            md2md: false,
            md2html: true,
            args: '--static-content',
        });
        compareDirectories(outputPath);
        compareDirectories(outputPath + '-html');
        // compareDirectories(outputPath + '-static-html');
    });
}

describe('Regression', () => {
    test(dedent`
        - not_var liquid syntax
        - normalize leading hrefs
        - empty href in toc item
    `);
});
