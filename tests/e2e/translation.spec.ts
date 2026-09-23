import type {TranslateRunArgs} from '../fixtures';

import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {glob} from 'glob';
import strip from 'strip-ansi';
import {describe, expect, test} from 'vitest';

import {
    MOCK_USER_PROMPT,
    TestAdapter,
    adaptiveCodeSupported,
    cleanupDirectory,
    compareDirectories,
    getTestPaths,
    startMockModel,
} from '../fixtures';

const generateMapTestTemplate = (
    testTitle: string,
    testRootPath: string,
    args: TranslateRunArgs,
    ignoreFileContent = true,
    // TODO: added especialy for 'extract openapi spec files with custom openapi schema provided' test, arc test issue
    ignoreFileList = false,
) => {
    test(testTitle, async () => {
        const {inputPath, outputPath} = getTestPaths(testRootPath);

        await TestAdapter.testTranslatePass(inputPath, outputPath, args);

        await compareDirectories(outputPath, ignoreFileContent, false, ignoreFileList);
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

        // Disable OpenAPI spec companions: the mock ships an openapi spec, and emitting the
        // `*.openapi.json` companion would change these translation snapshots.
        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2html,
            md2md,
            args: '--no-ai-openapi-companions',
        });

        await compareDirectories(outputPath);
    });
};

async function translateWithMockModel(
    testRootPath: string,
    dictionary: Record<string, string>,
    extraArgs: string[] = [],
) {
    const {inputPath, outputPath} = getTestPaths(testRootPath);

    await cleanupDirectory(outputPath);

    const model = await startMockModel(dictionary);

    try {
        const report = await TestAdapter.runner.runRaw([
            'translate',
            '--input',
            inputPath,
            '--output',
            outputPath,
            '--source',
            'ru-RU',
            '--target',
            'en-US',
            '--provider',
            'openai',
            '--model',
            'mock',
            '--auth',
            'mock-token',
            '--api-base',
            model.apiBase,
            '--user-prompt',
            MOCK_USER_PROMPT,
            '--max-concurrency',
            '1',
            '--retry',
            '1',
            '--rate-limit-retry',
            '0',
            '--no-cache',
            ...extraArgs,
        ]);

        expect(report.errors).toEqual([]);
        expect(report.code).toBe(0);
    } finally {
        await model.close();
    }

    expect(model.misses).toEqual([]);

    return {inputPath, outputPath};
}

/**
 * Lines of the translated page that differ from the source page.
 * Every other line is byte-identical, which is what keeps code examples valid.
 */
function changedLines(inputPath: string, outputPath: string, file: string) {
    const source = readFileSync(join(inputPath, file), 'utf8').split('\n');
    const result = readFileSync(join(outputPath, file), 'utf8').split('\n');

    expect(result.length, `line count changed, translated page:\n${result.join('\n')}`).toBe(
        source.length,
    );

    return result.filter((line, index) => line !== source[index]);
}

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

    generateFilesYamlTestTemplate(
        'extract openapi spec files with --no-ref-resolve option',
        'mocks/translation/openapi',
        {
            subcommand: 'extract',
            source: 'ru-RU',
            target: 'es-ES',
            additionalArgs: '--no-ref-resolve',
        },
    );

    generateMapTestTemplate(
        'extract openapi spec files with custom openapi schema provided',
        'mocks/translation/openapi',
        {
            subcommand: 'extract',
            source: 'ru-RU',
            target: 'es-ES',
            additionalArgs:
                '--schema mocks/translation/custom-schema/custom-openapi-schema-30.yaml',
        },
        false,
        true,
    );

    generateFilesYamlTestTemplate('compose openapi spec files', 'mocks/translation/compose', {
        subcommand: 'compose',
        source: 'ru-RU',
        target: 'es-ES',
    });

    generateFilesYamlTestTemplate(
        'compose yaml files with no extra spaces',
        'mocks/translation/yaml-space-format',
        {
            subcommand: 'compose',
            source: 'ru-RU',
            target: 'es-ES',
        },
    );

    generateMapTestTemplate(
        'do not translate merged entries with included toc',
        'mocks/translation/toc-include',
        {
            subcommand: 'extract',
            source: 'ru-RU',
            target: 'es-ES',
        },
    );

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

    let conditionVars = {prod: true, inner: true, list: ['item']};
    generateMapTestTemplate(
        'save truthy liquid conditions structures',
        'mocks/translation/conditions',
        {
            subcommand: 'extract',
            source: 'ru-RU',
            target: 'es-ES',
            additionalArgs: `--vars ${JSON.stringify(conditionVars)}`,
        },
        false,
    );

    conditionVars = {prod: false, inner: false, list: ['item']};
    generateMapTestTemplate(
        'remove falsy liquid conditions structures',
        'mocks/translation/conditions',
        {
            subcommand: 'extract',
            source: 'ru-RU',
            target: 'es-ES',
            additionalArgs: `--vars ${JSON.stringify(conditionVars)}`,
        },
        false,
    );

    test('do not extract link-included tocs on their own', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/translation/toc-include-link');

        await cleanupDirectory(outputPath);

        const report = await TestAdapter.extract.run(inputPath, outputPath, [
            '--source',
            'ru-RU',
            '--target',
            'es-ES',
        ]);

        // Regression guard: link-included tocs used to throw `Error while finding toc dir.`
        expect(report.errors).toEqual([]);
        expect(report.code).toBe(0);

        const produced = (await glob('**/*', {cwd: outputPath, nodir: true, posix: true})).sort();

        // Link-included tocs are inlined into their parent toc, so they must not be
        // extracted as standalone units.
        expect(produced).not.toContain('api/toc.yaml.xliff');
        expect(produced).not.toContain('api/common/toc.yaml.xliff');

        // ...but every title they contribute still lands in the parent toc.
        const rootXliff = readFileSync(join(outputPath, 'toc.yaml.xliff'), 'utf8');
        expect(rootXliff).toContain('API v6');
        expect(rootXliff).toContain('Общее');
    });

    test('translate keeps link-included tocs as standalone files', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/translation/toc-include-link');

        await cleanupDirectory(outputPath);

        // Unlike `extract`, `translate` reads every file as it is on disk: the
        // parent toc keeps its `include` entry, so the included toc needs a
        // translation of its own. A dry run lists the files without calling
        // the provider.
        const report = await TestAdapter.runner.runRaw([
            'translate',
            '--input',
            inputPath,
            '--output',
            outputPath,
            '--source',
            'ru-RU',
            '--target',
            'es-ES',
            '--provider',
            'openai',
            '--model',
            'test',
            '--api-base',
            'http://127.0.0.1:9/v1',
            '--auth',
            'dummy',
            '--dry-run',
        ]);

        expect(report.errors).toEqual([]);
        expect(report.code).toBe(0);

        const log = report.stdout + '\n' + report.stderr;
        const translated = log
            .split('\n')
            .map((line) => strip(line).trim())
            .filter((line) => line.startsWith('TRANSLATE '))
            .map((line) => line.slice('TRANSLATE '.length).trim().replace(/\\/g, '/'))
            .sort();

        expect(translated).toEqual([
            'api/common/thing.md',
            'api/common/toc.yaml',
            'api/index.md',
            'api/toc.yaml',
            'index.md',
            'toc.yaml',
        ]);
    });

    test('do not extract included tocs from sections without root articles', async () => {
        const {inputPath, outputPath} = getTestPaths(
            'mocks/translation/toc-include-no-root-articles',
        );

        await cleanupDirectory(outputPath);

        const report = await TestAdapter.extract.run(inputPath, outputPath, [
            '--source',
            'ru-RU',
            '--target',
            'es-ES',
        ]);

        // Regression guard: a section pulled in with a default (merge) include used
        // to crash extract with `Error while finding toc dir.` when all of its
        // articles live in subdirectories - nothing at the section root puts the
        // section directory into the merged-directories filter, so its toc leaked
        // into the extraction list.
        expect(report.errors).toEqual([]);
        expect(report.code).toBe(0);

        const produced = (await glob('**/*', {cwd: outputPath, nodir: true, posix: true})).sort();

        expect(produced).not.toContain('support/toc.yaml.xliff');

        // Section titles are inlined into the parent toc and stay translatable.
        const rootXliff = readFileSync(join(outputPath, 'toc.yaml.xliff'), 'utf8');
        expect(rootXliff).toContain('Поддержка');
        expect(rootXliff).toContain('Частые вопросы');
    });

    test.skipIf(!adaptiveCodeSupported)(
        'translate comments in fenced code and keep the code as is',
        async () => {
            const {inputPath, outputPath} = await translateWithMockModel(
                'mocks/translation/code-comments',
                {
                    'Комментарии в коде': 'Comments in code',
                    Комментарии: 'Comments',
                    'Комментарии в блоках кода': 'Comments in code blocks',
                    'Комментарии переводятся, код и отступы остаются как есть.':
                        'Comments are translated, code and indentation stay as is.',
                    'Клиентская часть': 'Client side',
                    'обязательное шифрование': 'encryption is required',
                    'Серверная часть': 'Server side',
                    'Загружаем конфиг': 'Load the config',
                    'из файла': 'from a file',
                    'Настройки клиента': 'Client settings',
                    'адрес сервера': 'server address',
                    'Выбираем всех пользователей': 'Select all users',
                    'без фильтра': 'without a filter',
                    'ваш токен': 'your token',
                    подсказка: 'hint',
                    'старый токен': 'old token',
                    'Пункт списка': 'List item',
                    'Комментарий в списке': 'Comment inside a list',
                    значение: 'value',
                },
            );

            expect(changedLines(inputPath, outputPath, 'index.md')).toEqual([
                '# Comments in code blocks',
                'Comments are translated, code and indentation stay as is.',
                '# Client side',
                '  encryption_mode: required # encryption is required',
                '# Server side',
                '# Load the config',
                'config = load()  # from a file',
                '// Client settings',
                "const url = 'https://example.com'; // server address",
                '-- Select all users',
                'SELECT * FROM users; -- without a filter',
                '# Client side',
                'export TOKEN=<your token> # hint',
                '# export TOKEN=<old token>',
                '- List item',
                '  # Comment inside a list',
                'value: <value>',
            ]);

            await compareDirectories(outputPath);
        },
    );

    test.skipIf(!adaptiveCodeSupported)(
        'translate only shell comments and placeholders in the precise code mode',
        async () => {
            const {inputPath, outputPath} = await translateWithMockModel(
                'mocks/translation/code-comments',
                {
                    'Комментарии в коде': 'Comments in code',
                    Комментарии: 'Comments',
                    'Комментарии в блоках кода': 'Comments in code blocks',
                    'Комментарии переводятся, код и отступы остаются как есть.':
                        'Comments are translated, code and indentation stay as is.',
                    'Клиентская часть': 'Client side',
                    'ваш токен': 'your token',
                    подсказка: 'hint',
                    // The precise mode sends the whole shell comment, commented-out code included.
                    'export TOKEN=&lt;старый токен&gt;': 'export TOKEN=&lt;old token&gt;',
                    'Пункт списка': 'List item',
                    значение: 'value',
                },
                ['--code', 'precise'],
            );

            // Comments of yaml, python, ts and sql fences stay untouched.
            expect(changedLines(inputPath, outputPath, 'index.md')).toEqual([
                '# Comments in code blocks',
                'Comments are translated, code and indentation stay as is.',
                '# Client side',
                'export TOKEN=<your token> # hint',
                '# export TOKEN=<old token>',
                '- List item',
                'value: <value>',
            ]);
        },
    );

    test.skipIf(!adaptiveCodeSupported)(
        'translate labels of mermaid diagrams and keep their structure',
        async () => {
            const {inputPath, outputPath} = await translateWithMockModel(
                'mocks/translation/mermaid',
                {
                    'Схемы mermaid': 'Mermaid diagrams',
                    Схемы: 'Diagrams',
                    'Подписи в схемах mermaid': 'Labels in mermaid diagrams',
                    RPC: 'RPC',
                    // Units reach the model XML-escaped, as they are stored in XLIFF.
                    'Клиент&lt;br/&gt;(bus_client)': 'Client&lt;br/&gt;(bus_client)',
                    'Создает protobuf сообщение': 'Creates a protobuf message',
                    'Передает сообщение как набор байт': 'Passes the message as a set of bytes',
                    Ответ: 'Response',
                    'Обмен Handshake': 'Handshake exchange',
                    'Каждую секунду': 'Every second',
                    'Дожидается полного сообщения&lt;br/&gt;по известному размеру':
                        'Waits for the whole message&lt;br/&gt;by its known size',
                    'Поток данных': 'Data flow',
                    Клиент: 'Client',
                    Запрос: 'Request',
                    Сервер: 'Server',
                    'Есть кэш?': 'Cached?',
                    Да: 'Yes',
                    Кэш: 'Cache',
                    Нет: 'No',
                    'База данных': 'Database',
                    Сеть: 'Network',
                    Доли: 'Shares',
                },
            );

            expect(changedLines(inputPath, outputPath, 'index.md')).toEqual([
                '# Labels in mermaid diagrams',
                '    participant C as Client<br/>(bus_client)',
                '    Note over RPC: Creates a protobuf message',
                '    RPC->>Bus: Passes the message as a set of bytes',
                '    Bus-->>+RPC: Response',
                '    Note over C,Bus: Handshake exchange',
                '    loop Every second',
                '        Bus->>Bus: Waits for the whole message<br/>by its known size',
                'title: Data flow',
                '    A[Client] -->|Request| B(Server)',
                '    B --> C{Cached?}',
                '    C -- Yes --> D[[Cache]]',
                '    C -. No .-> E[("Database")]',
                '    E ==> F((Response))',
                '    subgraph net [Network]',
                '    title Shares',
            ]);

            await compareDirectories(outputPath);
        },
    );

    const presetsDictionary = {
        Обзор: 'Overview',
        'Публичный абзац.': 'Public paragraph.',
        'Внутренний абзац.': 'Internal paragraph.',
        'Абзац только для внешних читателей.': 'A paragraph for external readers only.',
        'Поддержка отвечает по будням.': 'Support answers on weekdays.',
        Пресеты: 'Presets',
        'Внешний раздел': 'External section',
        'Внутренний раздел': 'Internal section',
        'Только для сотрудников.': 'For employees only.',
        'Чат поддержки на русском.': 'The support chat in Russian.',
        'Чат поддержки на английском.': 'The support chat in English.',
    };

    test('leave conditions alone without --presets, whatever presets.yaml says', async () => {
        const {outputPath} = await translateWithMockModel(
            'mocks/translation/presets',
            presetsDictionary,
            ['--exclude', 'ru/presets.yaml'],
        );

        const page = readFileSync(join(outputPath, 'en/index.md'), 'utf8');

        // Regular runs are unchanged: no variable is known, so every
        // condition keeps its block and goes to the model as text.
        expect(page).toContain('Internal paragraph.');
        expect(page).toContain('A paragraph for external readers only.');
        expect(page).toContain('audience == "internal"');
    });

    test('apply the vars preset of the .yfm root to conditions with --presets, as build does', async () => {
        const {outputPath} = await translateWithMockModel(
            'mocks/translation/presets',
            presetsDictionary,
            ['--exclude', 'ru/presets.yaml', '--presets'],
        );

        const page = readFileSync(join(outputPath, 'en/index.md'), 'utf8');

        // `audience` comes from the `public` section of presets.yaml, selected by
        // `varsPreset` of the .yfm root: the internal block is dropped and its
        // condition does not reach the model. `support` is defined only for the
        // source language (ru/presets.yaml), the target build does not know it,
        // so its block stays.
        expect(page).toContain('Public paragraph.');
        expect(page).toContain('A paragraph for external readers only.');
        expect(page).not.toContain('Внутренний абзац');
        expect(page).not.toContain('audience');
        expect(page).toContain('Support answers on weekdays.');
    });

    test('evaluate conditions under the presets of the target language', async () => {
        const {outputPath} = await translateWithMockModel(
            'mocks/translation/presets',
            presetsDictionary,
            ['--exclude', 'ru/presets.yaml', '--presets'],
        );

        const page = readFileSync(join(outputPath, 'en/index.md'), 'utf8');

        // ru/presets.yaml says `lang: ru`, en/presets.yaml says `lang: en`. The
        // translation is built as en/index.md, so the conditions see the target
        // presets: the Russian branch is dropped, the English one is translated.
        expect(page).toContain('The support chat in English.');
        expect(page).not.toContain('in Russian');
        expect(page).not.toContain('lang ==');
    });

    test('select another vars preset from the command line', async () => {
        const {outputPath} = await translateWithMockModel(
            'mocks/translation/presets',
            presetsDictionary,
            ['--exclude', 'ru/presets.yaml', '--presets', '--vars-preset', 'default'],
        );

        const page = readFileSync(join(outputPath, 'en/index.md'), 'utf8');

        // The `default` sections only: the audience is internal. `support` is
        // unset, and a condition on an unknown variable keeps its block, as
        // before presets: translation never drops content it cannot judge.
        expect(page).toContain('Internal paragraph.');
        expect(page).not.toContain('external readers');
        expect(page).toContain('Support answers on weekdays.');
    });

    test('let --vars override the presets', async () => {
        const {outputPath} = await translateWithMockModel(
            'mocks/translation/presets',
            presetsDictionary,
            ['--exclude', 'ru/presets.yaml', '--presets', '--vars', '{"audience":"internal"}'],
        );

        const page = readFileSync(join(outputPath, 'en/index.md'), 'utf8');

        expect(page).toContain('Internal paragraph.');
        expect(page).toContain('Support answers on weekdays.');
    });

    test('keep presets out of extract: the XLIFF for external tools takes --vars only', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/translation/presets');

        await cleanupDirectory(outputPath);

        const report = await TestAdapter.extract.run(inputPath, outputPath, [
            '--source',
            'ru-RU',
            '--target',
            'en-US',
            '--exclude',
            'ru/presets.yaml',
        ]);

        expect(report.errors).toEqual([]);
        expect(report.code).toBe(0);

        // Without --vars every condition stays unresolved and its content is
        // extracted as is, however the .yfm root or presets.yaml would decide it.
        // presets.yaml would make `audience` internal by default and the .yfm
        // root public: either way one of the blocks would vanish.
        const xliff = readFileSync(join(outputPath, 'en/index.md.xliff'), 'utf8');
        expect(xliff).toContain('Внутренний абзац.');
        expect(xliff).toContain('Абзац только для внешних читателей.');
        expect(xliff).toContain('Публичный абзац.');

        const toc = readFileSync(join(outputPath, 'en/toc.yaml.xliff'), 'utf8');
        expect(toc).toContain('Внутренний раздел');
        expect(toc).toContain('Внешний раздел');
    });
});
