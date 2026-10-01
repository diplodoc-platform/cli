import type {AITranslationConfig} from './index';
import type {LLMClient} from './clients/types';

import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
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
