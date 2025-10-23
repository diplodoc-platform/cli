import type {TranslateRunArgs} from '../fixtures';

import {describe, test} from 'vitest';

import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

const generateMapTestTemplate = (
    testTitle: string,
    testRootPath: string,
    args: TranslateRunArgs,
    ignoreFileContent = true,
) => {
    test(testTitle, async () => {
        const {inputPath, outputPath} = getTestPaths(testRootPath);

        await TestAdapter.testTranslatePass(inputPath, outputPath, args);

        await compareDirectories(outputPath, ignoreFileContent);
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

const buildFilesYamlTestTemplate = (
    testTitle: string,
    testRootPath: string,
    buildProps: {md2md?: boolean; md2html?: boolean},
) => {
    test(testTitle, async () => {
        const {inputPath, outputPath} = getTestPaths(testRootPath);
        const {md2md, md2html} = buildProps;

        await TestAdapter.testBuildPass(inputPath, outputPath, {md2html, md2md});

        await compareDirectories(outputPath);
    });
};

describe('Translate command', () => {
    buildFilesYamlTestTemplate(
        'build translated md files and remove no-translate directives',
        'mocks/translation/no-translate',
        {md2md: true},
    );

    buildFilesYamlTestTemplate(
        'build translated static files and remove no-translate directives',
        'mocks/translation/no-translate',
        {md2html: true},
    );

    generateFilesYamlTestTemplate('extract openapi spec files', 'mocks/translation/openapi', {
        subcommand: 'extract',
        source: 'ru-RU',
        target: 'es-ES',
    });

    generateMapTestTemplate('do not filter files on extract', 'mocks/translation/dir-files', {
        subcommand: 'extract',
        source: 'ru-RU',
        target: 'es-ES',
    });

    generateMapTestTemplate('filter files on extract', 'mocks/translation/dir-files', {
        subcommand: 'extract',
        source: 'ru-RU',
        target: 'es-ES',
        additionalArgs: '--filter',
    });

    generateMapTestTemplate(
        'filter files on extract with extra exclude option',
        'mocks/translation/dir-files',
        {
            subcommand: 'extract',
            source: 'ru-RU',
            target: 'es-ES',
            additionalArgs: '--exclude ru/to-be-excluded.md --filter',
        },
    );

    const vars = {skip: 'prod'};
    generateMapTestTemplate(
        'filter files on extract with extra vars option',
        'mocks/translation/dir-files',
        {
            subcommand: 'extract',
            source: 'ru-RU',
            target: 'es-ES',
            additionalArgs: `--vars ${JSON.stringify(vars)} --filter`,
        },
    );

    const conditions = {tld: 'ru'};
    generateMapTestTemplate(
        'resolve liquid conditions if vars specified, liquid syntax will be deleted',
        'mocks/translation/conditions',
        {
            subcommand: 'extract',
            source: 'ru-RU',
            target: 'es-ES',
            additionalArgs: `--vars ${JSON.stringify(conditions)}`,
        },
        false,
    );

    generateMapTestTemplate(
        'do not resolve liquid conditions if vars not specified and send content as is for extract',
        'mocks/translation/conditions',
        {
            subcommand: 'extract',
            source: 'ru-RU',
            target: 'es-ES',
        },
        false,
    );

    generateMapTestTemplate(
        'test no-translate directive',
        'mocks/translation/no-translate',
        {
            subcommand: 'extract',
            source: 'ru-RU',
            target: 'es-ES',
        },
        false,
    );

    generateFilesYamlTestTemplate('extract yaml scheme files', 'mocks/translation/yaml-scheme', {
        subcommand: 'extract',
        source: 'ru-RU',
        target: 'en-US',
    });
});
