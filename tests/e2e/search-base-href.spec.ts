import {access, mkdir, mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

import {TestAdapter} from '../fixtures';

describe('Local search publication paths', () => {
    let workspace: string;

    beforeAll(async () => {
        workspace = await realpath(await mkdtemp(join(tmpdir(), 'diplodoc-search-base-')));
    });

    afterAll(async () => {
        await rm(workspace, {recursive: true, force: true});
    });

    const deployments = [
        {name: 'absolute base', baseHref: 'https://example.com/help/docs/'},
        {name: 'relative base under a prefix', baseHref: undefined},
        {
            name: 'relative base at the origin root',
            baseHref: undefined,
            root: 'https://example.com/',
        },
    ];

    const cases = deployments.flatMap((deployment) =>
        [false, true].map((skipHtmlExtension) => ({...deployment, skipHtmlExtension})),
    );

    it.each(cases)(
        'loads emitted resources with $name (skipHtmlExtension=$skipHtmlExtension)',
        async (deployment) => {
            const {skipHtmlExtension} = deployment;
            const directory = await mkdtemp(join(workspace, 'case-'));
            const input = join(directory, 'input');
            const output = join(directory, 'output');
            const root = deployment.root || 'https://example.com/help/docs/';

            await mkdir(join(input, 'docs'), {recursive: true});
            await writeFile(
                join(input, '.yfm'),
                [
                    'lang: en',
                    'search:',
                    '  provider: local',
                    ...(deployment.baseHref ? [`baseHref: ${deployment.baseHref}`] : []),
                ].join('\n'),
            );
            await writeFile(join(input, 'toc.yaml'), 'href: docs/page.md\n');
            await writeFile(join(input, 'docs/page.md'), '# Searchable page\n\nContent.\n');

            await TestAdapter.testBuildPass(input, output, {
                md2md: false,
                args: skipHtmlExtension ? '--skip-html-extension' : '',
            });

            const searchPath = `_search/en/${skipHtmlExtension ? '' : 'index.html'}`;
            const html = await readFile(join(output, '_search/en/index.html'), 'utf8');
            const baseHref = html.match(/<base href="([^"]+)"/)?.[1];
            expect(baseHref).toBeDefined();
            const base = new URL(baseHref || '', new URL(searchPath, root));
            const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(
                (match) => match[1],
            );
            const styles = [...html.matchAll(/<link[^>]+href="([^"]+)"/g)].map((match) => match[1]);

            expect(scripts.length).toBeGreaterThan(0);
            expect(styles.length).toBeGreaterThan(0);

            for (const resource of [...scripts, ...styles]) {
                const url = new URL(resource, base);
                expect(url.href.startsWith(root), url.href).toBe(true);
                await access(join(output, url.pathname.slice(new URL(root).pathname.length)));
            }

            const resources = scripts.filter((script) => script.endsWith('-resources.js'));
            expect(resources).toHaveLength(1);
            expect(scripts.indexOf(resources[0])).toBeLessThan(
                scripts.findIndex((script) => new URL(script, base).pathname.includes('/_bundle/')),
            );

            const page = await readFile(join(output, 'docs/page.html'), 'utf8');
            const state = page.match(
                /<script[^>]+id="diplodoc-state"[^>]*>([\s\S]*?)<\/script>/,
            )?.[1];
            expect(state).toBeDefined();
            const {search} = JSON.parse(state || '{}') as {search: {link: string}};
            expect(new URL(search.link, root).href).toBe(
                new URL(`_search/en/${skipHtmlExtension ? '' : 'index.html'}`, root).href,
            );
        },
    );
});
