import type {AITranslationConfig} from './index';
import type {LLMClient} from './clients/types';

import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {seedTranslations} from '../../commands/seed';

import {Provider} from './provider';
import {FRAGMENT_SEPARATOR, splitFragments} from './prompts';

const directories: string[] = [];
afterEach(() => {
    for (const directory of directories.splice(0)) {
        rmSync(directory, {recursive: true, force: true});
    }
});

describe('approved translation preservation', () => {
    it('translates added releases while preserving the existing introduction and link padding', async () => {
        const directory = mkdtempSync(join(tmpdir(), 'approved-release-regression-'));
        directories.push(directory);
        const input = join(directory, 'input');
        const output = join(directory, 'output');
        const cacheDir = join(directory, 'cache');
        mkdirSync(join(input, 'en'), {recursive: true});
        mkdirSync(join(input, 'ru'), {recursive: true});

        const introduction =
            '## Server\n\nAll components are released as docker images.\n\n**Releases:**\n\n';
        const oldSource =
            '{% cut "**1.0**" %}\n\n- Fix the handler, [abc123](https://example.com/commit/abc123).\n\n{% endcut %}\n';
        const unseededRelease = '{% cut "**2.0**" %}\n\n- New feature 2.0.\n\n{% endcut %}\n\n';
        const approved =
            '## Сервер\n\nВсе компоненты поставляются в виде docker-образов.\n\n**Релизы:**\n\n{% cut "**1.0**" %}\n\n- Исправление обработчика, [abc123]( https://example.com/commit/abc123).\n\n{% endcut %}\n';
        writeFileSync(join(input, 'en/page.md'), introduction + unseededRelease + oldSource);
        writeFileSync(join(input, 'ru/page.md'), approved);
        await seedTranslations({
            input: input as AbsolutePath,
            files: ['en/page.md'],
            sourceLanguage: 'en',
            targetLanguage: 'ru',
            cacheDir: cacheDir as AbsolutePath,
        });
        const addedRelease = '{% cut "**3.0**" %}\n\n- New feature 3.0.\n\n{% endcut %}\n\n';
        writeFileSync(
            join(input, 'en/page.md'),
            introduction + addedRelease + unseededRelease + oldSource,
        );

        const client: LLMClient = {
            name: 'preservation-fixture',
            complete: vi.fn(async (messages) => ({
                text: splitFragments(messages[messages.length - 1].content)
                    .map((fragment) =>
                        fragment
                            .replace('New feature', 'Новая возможность')
                            .replace(
                                'All components are released as docker images.',
                                'Все компоненты выпускаются в виде Docker-образов.',
                            ),
                    )
                    .join(`\n${FRAGMENT_SEPARATOR}\n`),
            })),
        };
        const provider = new Provider(() => client, {} as never);
        Object.assign(provider, {
            logger: {
                translate: vi.fn(),
                translated: vi.fn(),
                request: vi.fn(),
                stat: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
                info: vi.fn(),
            },
        });
        await provider.translate(['en/page.md'], {
            input,
            output,
            cacheDir,
            source: {language: 'en', locale: 'US'},
            target: [{language: 'ru', locale: 'RU'}],
            vars: {},
            dryRun: false,
            model: 'fixture',
            userPrompt: '{{fragments}}',
            promptMode: 'append',
            glossaryPairs: [],
            temperature: 0,
            maxOutputTokens: 1000,
            maxBatchTokens: 3000,
            maxConcurrency: 1,
            retry: 0,
            memoryHints: false,
        } as unknown as AITranslationConfig);

        const expected =
            '## Сервер\n\nВсе компоненты поставляются в виде docker-образов.\n\n**Релизы:**\n\n{% cut "**3.0**" %}\n\n- Новая возможность 3.0.\n\n{% endcut %}\n\n{% cut "**2.0**" %}\n\n- Новая возможность 2.0.\n\n{% endcut %}\n\n{% cut "**1.0**" %}\n\n- Исправление обработчика, [abc123]( https://example.com/commit/abc123).\n\n{% endcut %}\n';
        expect(readFileSync(join(output, 'ru/page.md'), 'utf8')).toBe(expected);
        expect(
            vi
                .mocked(client.complete)
                .mock.calls.flatMap(([messages]) =>
                    splitFragments(messages[messages.length - 1].content),
                ),
        ).toEqual(['3.0', 'New feature 3.0.', '2.0', 'New feature 2.0.']);
    });
});

const copiedSource =
    '- [Включение шифрования на существующем кластере](#existing)\n\n#### Включение шифрования на существующем кластере {#existing}\n\nОбычный текст.\n';
const copiedTarget =
    '- [Enabling encryption on an existing cluster](#existing)\n\n#### Configuring encryption on an existing cluster {#existing}\n\n**Approved wording.**  \n';

async function translateCopy(
    options: {
        source?: string;
        oldSource?: string;
        oldTarget?: string;
        code?: 'no' | 'adaptive';
        ambiguous?: boolean;
        reuseFormatting?: 'source' | 'target';
        existing?: boolean;
        seedVars?: Hash;
        vars?: Hash;
    } = {},
) {
    const directory = mkdtempSync(join(tmpdir(), 'approved-copy-regression-'));
    directories.push(directory);
    const input = join(directory, 'input');
    const output = join(directory, 'output');
    const cacheDir = join(directory, 'cache');
    for (const [path, text] of Object.entries({
        'ru/old.md': options.oldSource || copiedSource,
        'en/old.md': options.oldTarget || copiedTarget,
        ...(options.ambiguous
            ? {
                  'ru/other.md': copiedSource,
                  'en/other.md': copiedTarget.replace('Configuring', 'Setting up'),
              }
            : {}),
    })) {
        mkdirSync(dirname(join(input, path)), {recursive: true});
        writeFileSync(join(input, path), text);
    }
    await seedTranslations({
        input: input as AbsolutePath,
        files: options.ambiguous ? ['ru/old.md', 'ru/other.md'] : ['ru/old.md'],
        sourceLanguage: 'ru',
        targetLanguage: 'en',
        vars: options.seedVars || {},
        code: options.code,
        cacheDir: cacheDir as AbsolutePath,
    });
    writeFileSync(join(input, 'ru/copied.md'), options.source || options.oldSource || copiedSource);
    // A move must work after the original file has disappeared from the input.
    if (options.existing) {
        writeFileSync(
            join(input, 'ru/old.md'),
            options.source || options.oldSource || copiedSource,
        );
    } else {
        rmSync(join(input, 'ru/old.md'));
    }
    const client: LLMClient = {
        name: 'copy-fixture',
        complete: vi.fn(async (messages) => ({
            text: splitFragments(messages[messages.length - 1].content)
                .map((fragment) =>
                    fragment
                        .replace('Новое описание.', 'New description.')
                        .replace('Обычный текст.', 'Plain wording.'),
                )
                .join(`\n${FRAGMENT_SEPARATOR}\n`),
        })),
    };
    const provider = new Provider(() => client, {} as never);
    Object.assign(provider, {
        logger: Object.fromEntries(
            ['translate', 'translated', 'request', 'stat', 'warn', 'error', 'info'].map((key) => [
                key,
                vi.fn(),
            ]),
        ),
    });
    await provider.translate([options.existing ? 'ru/old.md' : 'ru/copied.md'], {
        input,
        output,
        cacheDir,
        report: join(directory, 'report.json'),
        source: {language: 'ru', locale: 'RU'},
        target: [{language: 'en', locale: 'US'}],
        vars: options.vars || {},
        reuseFormatting: options.reuseFormatting,
        code: options.code,
        dryRun: false,
        model: 'fixture',
        userPrompt: '{{fragments}}',
        promptMode: 'append',
        glossaryPairs: [],
        temperature: 0,
        maxOutputTokens: 1000,
        maxBatchTokens: 3000,
        maxConcurrency: 1,
        retry: 0,
        memoryHints: false,
    } as unknown as AITranslationConfig);
    return {
        text: existsSync(join(output, options.existing ? 'en/old.md' : 'en/copied.md'))
            ? readFileSync(join(output, options.existing ? 'en/old.md' : 'en/copied.md'), 'utf8')
            : undefined,
        requests: vi.mocked(client.complete).mock.calls,
        report: JSON.parse(readFileSync(join(directory, 'report.json'), 'utf8')),
    };
}

describe('exact copied translation preservation', () => {
    it('keeps occurrence-specific headings and approved formatting byte for byte after a move', async () => {
        const result = await translateCopy();
        expect(result.text).toBe(copiedTarget);
        expect(result.requests).toHaveLength(0);
    });

    it('does not copy the whole approved target when a source sentence changed', async () => {
        const result = await translateCopy({
            source: copiedSource.replace('Обычный текст.', 'Новое описание.'),
        });
        expect(result.text).toContain('New description.');
        expect(result.text).not.toContain('Approved wording.');
        expect(result.requests.length).toBeGreaterThan(0);
    });

    it('does not restore old target markup in a copied file with added text', async () => {
        const result = await translateCopy({source: copiedSource + '\nНовое описание.\n'});
        expect(result.text).toContain('New description.');
        expect(result.text).not.toContain('**Approved wording.**');
    });

    it('does not choose between different approved translations of identical source files', async () => {
        const result = await translateCopy({ambiguous: true});
        expect(result.text).not.toBe(copiedTarget);
        expect(result.text).not.toContain('#### Configuring');
        expect(result.text).not.toContain('#### Setting up');
    });

    it('does not reuse a whole target under different condition variables', async () => {
        const result = await translateCopy({seedVars: {edition: 'old'}, vars: {edition: 'new'}});
        expect(result.text).not.toBe(copiedTarget);
        expect(result.text).not.toContain('**Approved wording.**');
    });
    it('keeps a complete copied target even when its merged prose cannot seed individual units', async () => {
        const result = await translateCopy({
            oldSource: 'Первое. Второе.\n',
            oldTarget: '**Approved merged translation.**\n',
        });
        expect(result.text).toBe('**Approved merged translation.**\n');
        expect(result.requests).toHaveLength(0);
    });

    it('keeps a complete copied target with no extractable units in no code mode', async () => {
        const result = await translateCopy({
            oldSource: '```text\nexample\n```\n',
            oldTarget: '```text\napproved example\n```\n',
            code: 'no',
        });
        expect(result.text).toBe('```text\napproved example\n```\n');
        expect(result.requests).toHaveLength(0);
    });

    it('counts all reused document units in the run report', async () => {
        const result = await translateCopy();
        expect(result.report.totals.units.total).toBe(3);
        expect(result.report.totals.units.fromCache).toBe(3);
        expect(result.report.totals.chars.source).toBeGreaterThan(0);
        expect(result.report.totals.requests.total).toBe(0);
    });
});

describe('source formatting policy', () => {
    const source = '## Шаги\n\n1. Первый шаг.\n1. Второй шаг с `key` и {{product}}.\n';
    const target =
        '# Steps\n\n\n1. **First step.**\n2. *Second step with `key` and {{product}}.*  \n';
    const expected = '## Steps\n\n1. First step.\n1. Second step with `key` and {{product}}.\n';
    it('preserves approved formatting by default', async () => {
        expect((await translateCopy({oldSource: source, oldTarget: target})).text).toBe(target);
    });
    it('keeps source headings, markers, whitespace and approved words on a copied file', async () => {
        const result = await translateCopy({
            oldSource: source,
            oldTarget: target,
            reuseFormatting: 'source',
        });
        expect(result.text).toBe(expected);
        expect(result.requests).toHaveLength(0);
    });
    it('applies the same policy to fragments of an existing file with added prose', async () => {
        const result = await translateCopy({
            oldSource: source,
            oldTarget: target,
            source: source + '\nНовое описание.\n',
            existing: true,
            reuseFormatting: 'source',
        });
        expect(result.text).toBe(expected + '\nNew description.\n');
        expect(result.requests).toHaveLength(1);
    });
    it('preserves localized destinations, extra anchors and protected examples', async () => {
        const oldSource =
            '# Заголовок {#source}\n\n[Ссылка](https://example.com/ru/page)\n\n```text\nПример\n```\n';
        const oldTarget =
            '# Heading {#source} {#localized}\n\n[Link]( https://example.com/en/page)\n\n```text\nExample\n```\n';
        const result = await translateCopy({
            oldSource,
            oldTarget,
            code: 'no',
            reuseFormatting: 'source',
        });
        expect(result.text, JSON.stringify(result.report.errors)).toBe(
            '# Heading {#source} {#localized}\n\n[Link](https://example.com/en/page)\n\n```text\nExample\n```\n',
        );
        expect(result.requests).toHaveLength(0);
    });
    it.each([
        ['merged prose', 'Первое. Второе.\n', '**Approved merged translation.**\n'],
        ['unsafe example', 'Текст.\n\n```sh\nrm file\n````\n', 'Text.\n\n```sh\nrm other\n````\n'],
    ])(
        'refuses %s in an existing seeded file before any model request',
        async (_name, oldSource, oldTarget) => {
            const result = await translateCopy({
                oldSource,
                oldTarget,
                existing: true,
                reuseFormatting: 'source',
            });
            expect(result.text).toBeUndefined();
            expect(
                result.report.errors.some(
                    (error: {code: string}) => error.code === 'REUSE_FORMATTING_UNSAFE',
                ),
            ).toBe(true);
            expect(result.requests).toHaveLength(0);
        },
    );
    it('refuses a copied translation whose sentences cannot align instead of publishing or retranslating it', async () => {
        const result = await translateCopy({
            oldSource: 'Первое. Второе.\n',
            oldTarget: '**Approved merged translation.**\n',
            reuseFormatting: 'source',
        });
        expect(result.text).toBeUndefined();
        expect(
            result.report.errors.some(
                (error: {code: string}) => error.code === 'REUSE_FORMATTING_UNSAFE',
            ),
        ).toBe(true);
        expect(result.requests).toHaveLength(0);
    });
});
