import {describe, expect, test} from 'vitest';
import {join} from 'node:path';
import {readFile} from 'node:fs/promises';

import {TestAdapter, getTestPaths} from '../fixtures';

const buildContentTestTemplate = (testTitle: string, testRootPath: string) => {
    test(testTitle, async () => {
        const {inputPath, outputPath} = getTestPaths(testRootPath);

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--build-content',
        });

        const contentMap = await readFile(join(outputPath, 'yfm-build-content.json'), 'utf-8');

        expect(JSON.parse(contentMap)).toMatchSnapshot();
    });
};

describe('Build content map for', () => {
    buildContentTestTemplate(
        'project with an include and a picture',
        'mocks/build-content-map/with-includes',
    );

    buildContentTestTemplate(
        'project with autotitle links between pages',
        'mocks/build-content-map/with-autotitles',
    );
});
