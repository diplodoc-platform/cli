import {describe, expect, test} from 'vitest';
import {TestAdapter, bundleless, getFileContent, getTestPaths} from '../fixtures';
import {join} from 'node:path';
import {readFile} from 'node:fs/promises';

const generateMapTestTemplate = (
    testTitle: string,
    testRootPath: string,
    md2md = true,
    md2html = true,
) => {
    test(testTitle, async () => {
        const {inputPath, outputPath} = getTestPaths(testRootPath);

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md,
            md2html,
            args: '--add-map-file --build-manifest',
        });

        const content = getFileContent(join(outputPath, 'files.json'));
        const manifestContent = await readFile(join(outputPath, 'yfm-build-manifest.json'), 'utf-8');

        expect(bundleless(content)).toMatchSnapshot();
        expect(JSON.parse(manifestContent)).toMatchSnapshot();
    });
};

describe('Generate map for', () => {
    generateMapTestTemplate(
        'project with single language and toc include',
        'mocks/generate-map/test1',
    );

    generateMapTestTemplate(
        'project with single language and toc include - only md2html',
        'mocks/generate-map/test1',
    );

    generateMapTestTemplate('project with multiple language', 'mocks/generate-map/test2');

    generateMapTestTemplate('project with external links in toc', 'mocks/generate-map/test3');
});
