import {dedent} from 'ts-dedent';
import {compareDirectories, getTestPaths, runYfmDocs} from '../utils';

function test(_description: string) {
    it('internal', () => {
        const {inputPath, outputPath} = getTestPaths(
            'mocks/regression',
        );

        runYfmDocs(inputPath, outputPath, {md2md: true, md2html: false});
        runYfmDocs(outputPath, outputPath + '-html', {
            md2md: false,
            md2html: true,
        });
        runYfmDocs(outputPath, outputPath + '-static-html', {
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
