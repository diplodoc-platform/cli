import {describe, test} from 'vitest';
import {CliTestAdapter, TranslateRunArgs} from '../fixtures/cliAdapter';
import {compareDirectories, getTestPaths} from '../fixtures';

const generateMapTestTemplate = (
    testTitle: string,
    testRootPath: string,
    args: TranslateRunArgs,
) => {
    const cliTestAdapter = new CliTestAdapter();

    test(testTitle, async () => {
        const {inputPath, outputPath} = getTestPaths(testRootPath);

        await cliTestAdapter.testTranslatePass(inputPath, outputPath, args);

        compareDirectories(outputPath, true);
    });
};

const generateFilesYamlTestTemplate = (
    testTitle: string,
    testRootPath: string,
    args: TranslateRunArgs,
) => {
    const cliTestAdapter = new CliTestAdapter();

    test(testTitle, async () => {
        const {inputPath, outputPath} = getTestPaths(testRootPath);

        await cliTestAdapter.testTranslatePass(inputPath, outputPath, args);

        compareDirectories(outputPath);
    });
};

describe('Translate command', () => {
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
