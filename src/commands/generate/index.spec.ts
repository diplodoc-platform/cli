import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {checkbox, input, select} from '@inquirer/prompts';
import {extractFrontMatter} from '@diplodoc/liquid';
import axios from 'axios';
import {load} from 'js-yaml';
import {parse as parseYaml} from 'yaml';

import {Program, parse} from '~/commands';
import {console} from '~/core/utils';

vi.mock('@inquirer/prompts', () => ({
    checkbox: vi.fn(),
    confirm: vi.fn(),
    input: vi.fn(),
    select: vi.fn(),
}));

let directory: string;
let output: string[];
const ttyDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');

beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'yfm-metadata-'));
    output = [];
    vi.stubEnv('OPENAI_API_KEY', 'test-token');
    vi.stubEnv('OPENROUTER_API_KEY', 'test-token');
    vi.spyOn(axios, 'post').mockResolvedValue(completion({description: 'Generated description'}));
    vi.spyOn(globalThis.console, 'error').mockImplementation(() => {});
    Object.defineProperty(process.stdin, 'isTTY', {value: false, configurable: true});
    vi.spyOn(console, 'log').mockImplementation((...args) => {
        output.push(args.join(' '));
    });

    for (const prompt of [checkbox, input, select]) {
        vi.mocked(prompt).mockRejectedValue(new Error('Unexpected interactive prompt'));
    }
});

afterEach(async () => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
    vi.unstubAllEnvs();

    if (ttyDescriptor) {
        Object.defineProperty(process.stdin, 'isTTY', ttyDescriptor);
    } else {
        Reflect.deleteProperty(process.stdin, 'isTTY');
    }

    await rm(directory, {recursive: true, force: true});
});

function fixturePath(name = 'article.md') {
    return join(directory, name) as AbsolutePath;
}

function readFixture(name = 'article.md') {
    return readFile(fixturePath(name), 'utf8');
}

function writeFixture(source: string, name = 'article.md') {
    return writeFile(fixturePath(name), source);
}

async function run(args: string[] = [], expectedCode = 0) {
    const argv = [
        'node',
        'yfm',
        'generate',
        'metadata',
        '-i',
        directory,
        '--provider',
        'openai',
        ...args,
    ];
    const program = new Program();

    await program.init(parse(argv));
    await program.parse(argv);
    expect(program.report.code).toBe(expectedCode);

    return program;
}

function completion(metadata: unknown) {
    return {data: {choices: [{message: {content: JSON.stringify(metadata)}}]}};
}

describe('yfm generate metadata', () => {
    it('uses the current directory when input is omitted', async () => {
        vi.spyOn(process, 'cwd').mockReturnValue(directory);
        await writeFixture('# Article\n');
        const argv = [
            'node',
            'yfm',
            'generate',
            'metadata',
            '--provider',
            'openai',
            '--fields',
            'description',
            '--skip-interactive',
        ];
        const program = new Program();

        await program.init(parse(argv));
        await program.parse(argv);

        expect(program.report.code).toBe(0);
        expect(program.generate.metadata.config.input).toBe(directory);
        expect(extractFrontMatter(await readFixture())[0]).toEqual({
            description: 'Generated description',
        });
    });

    it('fills missing fields while preserving existing metadata and the article', async () => {
        const source =
            '---\ntitle: Existing title # keep\nnoIndex: false\ncustom: value\n---\n# Article\n';
        await writeFixture(source);

        const program = await run();

        expect(program.generate.metadata.config.fields).toEqual(
            expect.arrayContaining(['title', 'keywords', 'noIndex', 'aiChat', '__metadata']),
        );
        expect(await readFixture()).toBe(
            source.replace(
                'custom: value\n',
                'custom: value\ndescription: "Generated description"\n',
            ),
        );

        const request = vi.mocked(axios.post).mock.calls[0][1] as {messages: {content: string}[]};
        expect(request.messages[1].content).toBe(source);
        const schema = JSON.parse(request.messages[0].content.split('JSON schema: ')[1]);
        expect(schema.properties).not.toHaveProperty('noIndex');
    });

    it('overrides config with flags and skips the wizard in a terminal', async () => {
        Object.defineProperty(process.stdin, 'isTTY', {value: true, configurable: true});
        await writeFixture(
            'generate:\n  metadata:\n    fields: [title, description]\n    mode: overwrite\n    provider: anthropic\n    model: configured-model\n',
            '.yfm',
        );
        await writeFixture('---\nnoIndex: true\n---\n# Article\n');
        vi.mocked(axios.post).mockResolvedValue(completion({keywords: ['article'], noIndex: true}));

        await run([
            '--skip-interactive',
            '--fields',
            ' keywords, noIndex,keywords ',
            '--provider',
            'openai',
        ]);

        expect(output).toEqual(
            expect.arrayContaining([
                'Fields: keywords, noIndex',
                'Mode: overwrite',
                'Provider: openai',
                'Model: configured-model',
            ]),
        );
        expect(await readFixture()).toContain('noIndex: true');
    });

    it('uses the wizard answers to update a single article', async () => {
        Object.defineProperty(process.stdin, 'isTTY', {value: true, configurable: true});
        vi.mocked(input).mockResolvedValueOnce(fixturePath());
        vi.mocked(input).mockResolvedValueOnce('custom-model');
        vi.mocked(checkbox).mockResolvedValueOnce(['summary']);
        vi.mocked(select).mockResolvedValueOnce('overwrite').mockResolvedValueOnce('openrouter');
        await writeFixture('# Article\n');
        vi.mocked(axios.post).mockResolvedValue(completion({summary: 'Article summary.'}));

        await run();

        expect(output).toEqual(
            expect.arrayContaining([
                `Input: ${fixturePath()}`,
                'Fields: summary',
                'Mode: overwrite',
                'Provider: openrouter',
                'Model: custom-model',
            ]),
        );
        expect(await readFixture()).toBe('---\nsummary: "Article summary."\n---\n# Article\n');
    });

    it.each([
        ['', undefined, 'gpt://wizard-folder/yandexgpt-lite/latest'],
        [' yandexgpt ', 'configured-folder', 'gpt://wizard-folder/yandexgpt/latest'],
        ['gpt://uri-folder/yandexgpt/latest', undefined, 'gpt://uri-folder/yandexgpt/latest'],
        ['ds://uri-folder/deepseek/latest', undefined, 'ds://uri-folder/deepseek/latest'],
    ] as const)(
        'resolves the YandexGPT wizard folder for model %j',
        async (model, folder, modelUri) => {
            Object.defineProperty(process.stdin, 'isTTY', {value: true, configurable: true});
            vi.stubEnv('YANDEX_API_KEY', 'test-token');
            vi.mocked(input).mockResolvedValueOnce(fixturePath()).mockResolvedValueOnce(model);
            vi.mocked(checkbox).mockResolvedValueOnce(['summary']);
            vi.mocked(select).mockResolvedValueOnce('missing').mockResolvedValueOnce('yandexgpt');

            if (!model.includes('://')) {
                vi.mocked(input).mockImplementationOnce(async (config) => {
                    expect(config.default).toBe(folder);
                    expect(await config.validate?.('   ')).not.toBe(true);
                    expect(await config.validate?.('wizard-folder')).toBe(true);

                    return '  wizard-folder  ';
                });
            }

            if (folder) {
                await writeFixture(`generate:\n  metadata:\n    folder: ${folder}\n`, '.yfm');
            }

            await writeFixture('# Article\n');
            vi.mocked(axios.post).mockResolvedValue({
                data: {
                    result: {
                        alternatives: [
                            {
                                message: {text: '{"summary":"Article summary."}'},
                                status: 'ALTERNATIVE_STATUS_FINAL',
                            },
                        ],
                    },
                },
            });

            await run();

            expect(vi.mocked(axios.post).mock.calls[0][1]).toHaveProperty('modelUri', modelUri);
            expect(extractFrontMatter(await readFixture())[0]).toEqual({
                summary: 'Article summary.',
            });
        },
    );

    it('validates YandexGPT JSON locally without constrained decoding', async () => {
        const metadata = {summary: 'About Diplodoc.', tags: ['CI/CD']};
        await writeFixture('# Diplodoc\n');
        vi.stubEnv('YANDEX_API_KEY', 'test-token');
        vi.mocked(axios.post).mockResolvedValue({
            data: {
                result: {
                    alternatives: [
                        {
                            message: {text: JSON.stringify(metadata)},
                            status: 'ALTERNATIVE_STATUS_FINAL',
                        },
                    ],
                },
            },
        });

        await run([
            '--provider',
            'yandexgpt',
            '--folder',
            'test-folder',
            '--fields',
            'summary,tags',
            '--retry',
            '0',
        ]);
        const request = vi.mocked(axios.post).mock.calls[0][1];

        expect(request).not.toHaveProperty('jsonSchema');
        expect(request).not.toHaveProperty('jsonObject');
        expect(await readFixture()).toBe(
            '---\nsummary: "About Diplodoc."\ntags:\n  - "CI/CD"\n---\n# Diplodoc\n',
        );
    });

    it('updates page metadata in a directory and skips includes and configuration', async () => {
        await mkdir(join(directory, '_includes'));
        await writeFile(join(directory, '_includes', 'part.md'), '# Include\n');
        await writeFixture('items: []\n', 'toc.yaml');
        await writeFixture('links: []\n', 'toc.yml');
        await writeFixture('blocks: []\n', 'presets.yml');
        await writeFixture('- one\n- two\n', 'data.yaml');
        await writeFixture('title: Page\nlinks: []\nmeta:\n  custom: value # keep\n', 'page.yaml');
        await writeFixture('\uFEFF# Article\r\n');

        await run(['--fields', 'description']);
        const page = await readFixture('page.yaml');

        expect(parseYaml(page)).toEqual({
            title: 'Page',
            links: [],
            meta: {custom: 'value', description: 'Generated description'},
        });
        expect(page).toContain('# keep');
        expect(await readFixture()).toBe(
            '---\r\ndescription: "Generated description"\r\n---\r\n# Article\r\n',
        );
        expect(axios.post).toHaveBeenCalledTimes(2);
    });

    it('does not request a model when all selected fields are already present', async () => {
        const source = '---\ntitle: ""\nnoIndex: false\n---\n# Article\n';
        await writeFixture(source);
        vi.stubEnv('OPENAI_API_KEY', '');

        await run(['--fields', 'title,noIndex']);

        expect(axios.post).not.toHaveBeenCalled();
        expect(await readFixture()).toBe(source);
    });

    it('saves each document before requesting metadata for the next one', async () => {
        await writeFixture('# First\n', 'a.md');
        await writeFixture('# Second\n', 'b.md');
        vi.mocked(axios.post)
            .mockResolvedValueOnce(completion({description: 'First description'}))
            .mockImplementationOnce(async () => {
                expect(extractFrontMatter(await readFixture('a.md'))[0]).toEqual({
                    description: 'First description',
                });

                return completion({description: 'Second description'});
            });

        await run(['--fields', 'description', '--retry', '0']);

        expect(axios.post).toHaveBeenCalledTimes(2);
        expect(extractFrontMatter(await readFixture('b.md'))[0]).toEqual({
            description: 'Second description',
        });
    });

    it('stops requesting metadata after a document fails validation', async () => {
        await writeFixture('# First\n', 'a.md');
        await writeFixture('# Second\n', 'b.md');
        vi.mocked(axios.post).mockResolvedValueOnce(completion({description: false}));

        await run(['--fields', 'description', '--retry', '0'], 1);

        expect(axios.post).toHaveBeenCalledTimes(1);
        expect(await readFixture('a.md')).toBe('# First\n');
        expect(await readFixture('b.md')).toBe('# Second\n');
    });

    it.each(['```json\n', '```\n', '```json \t\r\n\r\n'])(
        'accepts JSON wrapped in a Markdown fence starting with %j',
        async (opening) => {
            await writeFixture('# Article\n');
            vi.mocked(axios.post).mockResolvedValue({
                data: {
                    choices: [
                        {message: {content: opening + '{"description":"About the article"}\n```'}},
                    ],
                },
            });

            await run(['--fields', 'description', '--retry', '0']);

            expect(extractFrontMatter(await readFixture())[0]).toEqual({
                description: 'About the article',
            });
        },
    );

    it('fills an empty metadata block in a YAML page', async () => {
        await writeFixture('title: Page\nlinks: []\nmeta:\n', 'page.yaml');

        await run(['--fields', 'description']);

        expect(parseYaml(await readFixture('page.yaml')).meta).toEqual({
            description: 'Generated description',
        });
    });

    it('preserves metadata inherited through YAML merge keys', async () => {
        const source =
            'defaults: &defaults\n  description: Existing\nlinks: []\nmeta:\n  <<: *defaults\n';
        await writeFixture(source, 'page.yaml');

        await run(['--fields', 'description']);

        expect(axios.post).not.toHaveBeenCalled();
        expect(await readFixture('page.yaml')).toBe(source);
    });

    it.each([
        {fields: 'description', result: {description: 42}},
        {fields: 'description', result: {title: 'Unselected title'}},
        {fields: 'summary', result: {summary: 'x'.repeat(101)}},
        {fields: 'canonical', result: {canonical: 'not a URL'}},
        {fields: 'summary', result: {summary: 'Флаг `--no-cache` отключа'}},
        {fields: 'summary', result: {summary: 'Описание обрывается...'}},
        {fields: 'tags', result: {tags: ['CI\u0000CD']}},
        {fields: 'tags', result: {tags: ['CI\nCD']}},
        {fields: 'author', result: {author: {name: 'User\u0007'}}},
        {fields: 'metadata', result: {metadata: {'bad\u0000key': 'value'}}},
    ])('leaves the file unchanged for invalid $fields output', async ({fields, result}) => {
        const source = '# Article\n';
        await writeFixture(source);
        vi.mocked(axios.post).mockResolvedValue(completion(result));

        await run(['--fields', fields, '--retry', '0'], 1);

        expect(await readFixture()).toBe(source);
    });

    it('names unexpected response properties without writing them', async () => {
        await writeFixture('# Article\n');
        vi.mocked(axios.post).mockResolvedValue(
            completion({summary: 'Short summary', title: 'Extra'}),
        );

        await run(['--fields', 'summary,tags', '--retry', '0'], 1);

        expect(globalThis.console.error).toHaveBeenCalledWith(
            expect.stringContaining('unexpected property "title"'),
        );
        expect(await readFixture()).toBe('# Article\n');
    });

    it('retries an invalid response before writing valid metadata', async () => {
        await writeFixture('# Article\n');
        vi.mocked(axios.post).mockResolvedValueOnce(completion({description: false}));

        await run(['--fields', 'description', '--retry', '1']);

        expect(await readFixture()).toContain('description: "Generated description"');
        expect(axios.post).toHaveBeenCalledTimes(2);
        const request = vi.mocked(axios.post).mock.calls[1][1] as {messages: {content: string}[]};
        expect(request.messages[0].content).toContain('data/description must be string');
    });

    it.each(['First line\nSecond line\t2026', 'First line\nSecond line\n\n'])(
        'preserves whitespace in multiline metadata %j',
        async (description) => {
            await writeFixture('# Article\n');
            const metadata = {description};
            vi.mocked(axios.post).mockResolvedValue(completion(metadata));

            await run(['--fields', 'description', '--retry', '0']);

            expect(extractFrontMatter(await readFixture())[0]).toEqual(metadata);
        },
    );

    it.each(['यह उपकरण रिपोर्ट बनाता है।', 'تتيح الأداة تصدير التقارير؟'])(
        'accepts sentence punctuation in %s',
        async (summary) => {
            await writeFixture('# Article\n');
            vi.mocked(axios.post).mockResolvedValue(completion({summary}));

            await run(['--fields', 'summary', '--retry', '0']);

            expect(await readFixture()).toContain(summary);
        },
    );

    it('rejects unclosed frontmatter before contacting a provider', async () => {
        const source = '---\ntitle: Unclosed\n# Article\n';
        await writeFixture(source);

        await run([], 1);

        expect(axios.post).not.toHaveBeenCalled();
        expect(await readFixture()).toBe(source);
    });

    it.each([
        ['article.md', '---\ntitle: {{ product-name }}\n---\n# Article\n'],
        ['article.md', '---\ntitle: "{% if enabled %}Product{% endif %}"\n---\n# Article\n'],
        ['page.yaml', 'title: {{ product-name }}\nlinks: []\n'],
    ])('rejects Liquid in %s YAML before requesting metadata', async (name, source) => {
        await writeFixture(source, name);
        vi.mocked(axios.post).mockResolvedValue(completion({summary: 'Article summary.'}));

        await run(['--fields', 'summary', '--retry', '0'], 1);

        expect(globalThis.console.error).toHaveBeenCalledWith(expect.stringContaining('Liquid'));
        expect(axios.post).not.toHaveBeenCalled();
        expect(await readFixture(name)).toBe(source);
    });

    it.each([
        ['----', '----', '\n', '# {{ product-name }}\n'],
        ['-----  ', '---', '\r\n', '# Article\r\n'],
        ['---', '-----', '\n', ''],
    ])('preserves frontmatter delimited by %s and %s', async (open, close, newline, body) => {
        const source =
            [open, 'title: Existing title', 'noIndex: true', close].join(newline) +
            (body ? newline + body : '');
        await writeFixture(source);
        vi.mocked(axios.post).mockResolvedValue(completion({summary: 'Article summary.'}));

        await run(['--fields', 'summary', '--retry', '0']);
        const generated = await readFixture();

        expect(generated).toBe(
            source.replace(
                `noIndex: true${newline}`,
                `noIndex: true${newline}summary: "Article summary."${newline}`,
            ),
        );
        expect(extractFrontMatter(generated)[0]).toEqual({
            title: 'Existing title',
            noIndex: true,
            summary: 'Article summary.',
        });
    });

    it.each([
        {'restricted-access': [['role', 'admin']]},
        {noIndex: false},
        {interface: {search: true}},
        {script: ['new.js']},
    ])('rejects changed or invented publication settings: %j', async (settings) => {
        const source =
            '---\nrestricted-access: [["role:admin"]]\nnoIndex: true\ninterface: {search: false}\n---\n# Article\n';
        await writeFixture(source);
        vi.mocked(axios.post).mockResolvedValue(
            completion({summary: 'Article summary.', ...settings}),
        );

        await run(['--mode', 'overwrite', '--retry', '0'], 1);

        expect(globalThis.console.error).toHaveBeenCalledWith(
            expect.stringContaining('publication setting'),
        );
        expect(await readFixture()).toBe(source);
    });

    it('preserves matching publication settings and their comments while updating summary', async () => {
        const source =
            '---\nrestricted-access:\n  - - role:admin # keep\ninterface: { search: false, toc: true }\n---\n# Article\n';
        await writeFixture(source);
        vi.mocked(axios.post).mockResolvedValue(
            completion({
                summary: 'Article summary.',
                'restricted-access': [['role:admin']],
                interface: {toc: true, search: false},
            }),
        );

        await run(['--mode', 'overwrite', '--retry', '0']);

        expect(await readFixture()).toBe(
            source.replace('\n---\n# Article', '\nsummary: "Article summary."\n---\n# Article'),
        );
    });

    it('rejects aliased page metadata before contacting a provider', async () => {
        const source =
            'defaults: &settings\n  restricted-access: [["role:admin"]]\nlinks: []\nmeta: *settings\n';
        await writeFixture(source, 'page.yaml');

        await run(['--fields', 'description', '--retry', '0'], 1);

        expect(globalThis.console.error).toHaveBeenCalledWith(
            expect.stringContaining('meta is a YAML alias'),
        );
        expect(axios.post).not.toHaveBeenCalled();
        expect(await readFixture('page.yaml')).toBe(source);
    });

    it.each([
        [
            'article.md',
            '---\ntitle: &role role:admin\nrestricted-access: [[*role]]\n---\n# Article\n',
        ],
        [
            'page.yaml',
            'meta:\n  title: &label Original\nlinks:\n  - title: *label\n    href: index.md\n',
        ],
    ])('rejects indirect changes through YAML aliases in %s', async (name, source) => {
        await writeFixture(source, name);
        vi.mocked(axios.post).mockResolvedValue(completion({title: 'role:public'}));

        await run(['--fields', 'title', '--mode', 'overwrite', '--retry', '0'], 1);

        expect(await readFixture(name)).toBe(source);
    });

    it.each(['article.md', 'page.yaml'])(
        'preserves string types for the build parser in %s',
        async (name) => {
            const source = name.endsWith('.md')
                ? '---\ntitle: Existing\ncustom: 1_000\n---\n# Article\n'
                : 'title: Page\nlinks: []\nmeta:\n  title: Existing\n  custom: 1_000\n';
            const metadata = {
                title: '1_000',
                tags: ['1_000', '2026-11-09', '0xFF'],
                keywords: [{keyword: '1_000'}],
            };
            await writeFixture(source, name);
            vi.mocked(axios.post).mockResolvedValue(completion(metadata));

            await run(['--fields', 'title,tags,keywords', '--mode', 'overwrite', '--retry', '0']);
            const generated = await readFixture(name);
            const parseMetadata = (content: string) =>
                name.endsWith('.md')
                    ? extractFrontMatter(content)[0]
                    : (load(content) as {meta: Record<string, unknown>}).meta;

            expect(parseMetadata(generated)).toEqual({...parseMetadata(source), ...metadata});
        },
    );

    it.each(['', '----\r\ntitle: Existing\r\nnoIndex: true\r\n----\r\n'])(
        'writes build-readable frontmatter for BOM input %j',
        async (frontmatter) => {
            const body = '# Article\r\n\r\nText with an interior \uFEFF character.\r\n';
            await writeFixture('\uFEFF' + frontmatter + body);

            await run(['--fields', 'description', '--retry', '0']);
            const generated = await readFixture();
            const [metadata, article] = extractFrontMatter(generated);

            expect(generated.startsWith('---')).toBe(true);
            expect(metadata).toEqual(
                frontmatter
                    ? {title: 'Existing', noIndex: true, description: 'Generated description'}
                    : {description: 'Generated description'},
            );
            expect(article).toBe(body);
        },
    );

    it.each(['unknown', '', 'title,'])('rejects invalid field selection %j', async (fields) => {
        await expect(run(['--fields', fields])).rejects.toThrow(/field/i);
    });
});
