import {dedent} from 'ts-dedent';
import {createRunner, getTestPaths, compareDirectories} from '../fixtures';

function test(_description: string) {
    const runner = createRunner();

    it('internal', async () => {
        const {inputPath, outputPath} = getTestPaths(
            'mocks/regression',
        );

        await runner.runYfmDocs(inputPath, outputPath, {md2md: true, md2html: false});
        await runner.runYfmDocs(outputPath, outputPath + '-html', {
            md2md: false,
            md2html: true,
        });
        await runner.runYfmDocs(outputPath, outputPath + '-static-html', {
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
