import type {AITranslationConfig} from './index';
import type {LLMClient} from './clients/types';

import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {extract} from '@diplodoc/translation';
import transform from '@diplodoc/transform';
import {parse} from 'node-html-parser';

import {seedTranslations} from '../../commands/seed';

import {Provider} from './provider';
import {FRAGMENT_SEPARATOR, splitFragments} from './prompts';

type Fixture = {
    name: string;
    source: string;
    translations: [string, string][];
    fault?: [string, string];
    expected: string;
    fallback?: string;
    seed?: {source: string; target: string};
    title?: {translated: string; fallback?: string};
};

const fixtures: Fixture[] = JSON.parse(
    readFileSync(join(__dirname, '__fixtures__/markup-regressions.json'), 'utf8'),
);
const directories: string[] = [];
// The paired library PR is not released yet. Keep these integration cases
// visible as skipped on 1.10.0; they run against the locally packed candidate.
const supportsTableTitles =
    'tableTitles' in
    extract('{wide-content title="Имя"}', {
        source: {language: 'ru', locale: 'RU'},
        target: {language: 'en', locale: 'US'},
    });

afterEach(() => {
    for (const dir of directories.splice(0)) {
        rmSync(dir, {recursive: true, force: true});
    }
});

/** Only the model is replaced; extraction, repairs, cache and composition stay real. */
async function translate(fixture: Fixture, persistent: boolean) {
    const root = mkdtempSync(join(tmpdir(), 'markup-document-regression-'));
    directories.push(root);
    const input = join(root, 'input');
    mkdirSync(join(input, 'ru'), {recursive: true});
    if (fixture.seed) {
        mkdirSync(join(input, 'en'), {recursive: true});
        writeFileSync(join(input, 'ru/page.md'), fixture.seed.source);
        writeFileSync(join(input, 'en/page.md'), fixture.seed.target);
        await seedTranslations({
            input: input as AbsolutePath,
            files: ['ru/page.md'],
            sourceLanguage: 'ru',
            targetLanguage: 'en',
            vars: {},
            cacheDir: join(root, 'cache') as AbsolutePath,
        });
    }
    writeFileSync(join(input, 'ru/page.md'), fixture.source);
    let injected = false;
    const client: LLMClient = {
        name: 'fixture',
        complete: vi.fn(async (messages) => ({
            text: splitFragments(messages[messages.length - 1].content)
                .map((fragment) => {
                    let answer = fixture.translations.reduce(
                        (text, [from, to]) => text.split(from).join(to),
                        fragment,
                    );
                    if (
                        fixture.fault &&
                        (!injected || persistent) &&
                        answer.includes(fixture.fault[0])
                    ) {
                        answer = answer.replace(...fixture.fault);
                        injected = true;
                    }
                    return answer;
                })
                .join(`\n${FRAGMENT_SEPARATOR}\n`),
        })),
    };
    const provider = new Provider(() => client, {} as never);
    const warn = vi.fn();
    Object.assign(provider, {
        logger: {
            translate: vi.fn(),
            translated: vi.fn(),
            request: vi.fn(),
            stat: vi.fn(),
            warn,
            error: vi.fn(),
            info: vi.fn(),
        },
    });
    const report = join(root, 'report.json');
    const config = {
        input,
        output: join(root, 'out'),
        report,
        cacheDir: join(root, 'cache'),
        source: {language: 'ru', locale: 'RU'},
        target: [{language: 'en', locale: 'US'}],
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
    } as unknown as AITranslationConfig;
    await provider.translate(['ru/page.md'], config);
    const first = JSON.parse(readFileSync(report, 'utf8'));
    const markdown = readFileSync(join(root, 'out/en/page.md'), 'utf8');
    const cacheFile = join(root, 'cache/fixture.fixture.ru-en.json');
    const cachedTranslations = (): string[] =>
        existsSync(cacheFile)
            ? Object.values(JSON.parse(readFileSync(cacheFile, 'utf8')).translations)
            : [];
    const firstCache = cachedTranslations();
    // Reusing the persistent cache must not suppress another repair attempt
    // for a fragment previously kept in the source language.
    if (persistent) {
        await provider.translate(['ru/page.md'], config);
    }
    return {
        markdown,
        lastMarkdown: readFileSync(join(root, 'out/en/page.md'), 'utf8'),
        first,
        last: JSON.parse(readFileSync(report, 'utf8')),
        firstCache,
        lastCache: cachedTranslations(),
        injected,
        warn,
        requests: vi.mocked(client.complete).mock.calls,
    };
}

describe('markup document regression fixtures', () => {
    it.for(fixtures)('composes the expected document: $name', async (fixture, ctx) => {
        if (fixture.title && !supportsTableTitles) ctx.skip();
        const {markdown, first, injected, requests} = await translate(fixture, false);
        expect(markdown).toBe(fixture.expected);
        expect(injected).toBe(Boolean(fixture.fault));
        expect(first.totals.fixes.markupDamaged).toBe(0);
        expect(first.totals.fixes.markupRetried).toBe(fixture.fault ? 1 : 0);
        if (fixture.title) {
            expect(
                parse(transform(markdown).result.html)
                    .querySelector('table')
                    ?.getAttribute('title'),
            ).toBe(fixture.title.translated);
            if (fixture.fault) {
                expect(
                    requests.some(([messages]) => messages[0].content.includes('wide-table title')),
                ).toBe(true);
            }
        }
    });

    it.for(fixtures.filter((fixture) => fixture.fault))(
        'keeps only the damaged unit as source and retries on the next run: $name',
        async (fixture, ctx) => {
            if (fixture.title && !supportsTableTitles) ctx.skip();
            const {markdown, lastMarkdown, first, last, firstCache, lastCache, warn} =
                await translate(fixture, true);
            expect(markdown).toBe(fixture.fallback);
            expect(lastMarkdown).toBe(fixture.fallback);
            // All successful fixture translations are English. Russian text
            // in either persisted snapshot would be a cached source fallback.
            for (const cached of [...firstCache, ...lastCache]) {
                expect(cached).not.toMatch(/[А-Яа-яЁё]/);
            }
            if (fixture.name === 'tracker-numbered-list-keeps-original-emphasis') {
                expect(firstCache.length).toBeGreaterThan(0);
                expect(last.totals.cache.hits).toBeGreaterThan(0);
            }
            expect(first.totals.fixes.markupDamaged).toBe(1);
            expect(last.totals.fixes.markupRetried).toBe(1);
            expect(last.totals.fixes.markupDamaged).toBe(1);
            if (fixture.title) {
                expect(
                    parse(transform(markdown).result.html)
                        .querySelector('table')
                        ?.getAttribute('title'),
                ).toBe(fixture.title.fallback);
                expect(
                    warn.mock.calls.some((call) =>
                        String(call[1]).includes('original wide-table title'),
                    ),
                ).toBe(true);
            }
        },
    );
});
