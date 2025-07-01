import {describe, test} from 'vitest';
import {TestAdapter, TranslateRunArgs, compareDirectories, getTestPaths} from '../fixtures';

const generateMapTestTemplate = (
    testTitle: string,
    testRootPath: string,
    args: TranslateRunArgs,
) => {
    test.skip(testTitle, async () => {
        const {inputPath, outputPath} = getTestPaths(testRootPath);

        await TestAdapter.testTranslatePass(inputPath, outputPath, args);

        await compareDirectories(outputPath, true);
    });
};

const generateFilesYamlTestTemplate = (
    testTitle: string,
    testRootPath: string,
    args: TranslateRunArgs,
) => {
    test(testTitle, async () => {
        const {inputPath, outputPath} = getTestPaths(testRootPath);

        await TestAdapter.testTranslatePass(inputPath, outputPath, args);

        await compareDirectories(outputPath);
    });
};

describe('Translate command', () => {
    generateFilesYamlTestTemplate('extract openapi spec files', 'mocks/translation/openapi', {
        subcommand: 'extract',
        source: 'ru-RU',
        target: 'es-ES',
    });

    generateMapTestTemplate('filter files on extract', 'mocks/translation/dir-files', {
        subcommand: 'extract',
        source: 'ru-RU',
        target: 'es-ES',
    });

    generateMapTestTemplate(
        'filter files on extract with extra exclude option',
        'mocks/translation/dir-files',
        {
            subcommand: 'extract',
            source: 'ru-RU',
            target: 'es-ES',
            additionalArgs: '--exclude ru/_no-translate/*.md',
        },
    );

    generateFilesYamlTestTemplate('extract yaml scheme files', 'mocks/translation/yaml-scheme', {
        subcommand: 'extract',
        source: 'ru-RU',
        target: 'en-US',
    });
});
