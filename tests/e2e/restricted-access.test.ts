import {describe, expect, test} from 'vitest';
import {join} from 'node:path';
import {readFile} from 'node:fs/promises';

import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

const generateFilesYamlTestTemplate = (testTitle: string, testRootPath: string) => {
    test(testTitle, async () => {
        const {inputPath, outputPath} = getTestPaths(testRootPath);
        await TestAdapter.testBuildPass(inputPath, outputPath, {md2md: true});
        await compareDirectories(outputPath);
    });
};

describe('Restricted access', () => {
    generateFilesYamlTestTemplate('Simple restricted access', 'mocks/restricted-access/test1');

    generateFilesYamlTestTemplate('Nested restricted access', 'mocks/restricted-access/test2');

    generateFilesYamlTestTemplate('Nested toc restricted access', 'mocks/restricted-access/test3');

    test('emits empty restrictedAccess when the project has no restrictions', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/generate-map/test1');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            args: '--build-manifest',
        });

        const manifest = JSON.parse(
            await readFile(join(outputPath, 'yfm-build-manifest.json'), 'utf-8'),
        );

        expect(manifest.restrictedAccess).toEqual({});
    });

    test('emits restrictedAccess map in build manifest', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/restricted-access/test1');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            args: '--build-manifest',
        });

        const manifest = JSON.parse(
            await readFile(join(outputPath, 'yfm-build-manifest.json'), 'utf-8'),
        );

        expect(manifest.restrictedAccess).toEqual({
            index: [['admin']],
            'plugins/index': [['admin']],
            'plugins/index2': [['admin'], ['admin', 'user']],
            'plugins/index3': [['admin']],
            'plugins/index4': [['admin'], ['customInFile']],
        });
        expect(manifest.restrictedAccess).not.toHaveProperty('plugins/index.md');
    });
});
