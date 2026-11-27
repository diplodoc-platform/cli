import type {Run} from '~/commands/build';
import type {Toc} from '~/core/toc';
import type * as Collection from '../output-md/collect';

import {join} from 'node:path';
import {describe, expect, it, vi} from 'vitest';
import {load} from 'js-yaml';

import {OutputFormat} from '~/commands/build/config';
import {normalizePath} from '~/core/utils';

import {Llms} from './index';

vi.mock('../output-md/collect', async (importOriginal) => {
    const actual = await importOriginal<typeof Collection>();
    const {filterAudienceContent} = await import('@diplodoc/transform/plugins/visibility');
    return {
        ...actual,
        MarkdownCollector: vi.fn().mockImplementation((run: Run, _profile, options) => ({
            collectWithInfo: async (path: NormalizedPath) => ({
                content: filterAudienceContent(await run.markdown.load(path), options.audience)
                    .content,
                errors: [],
                audienceSpecificContent: [],
            }),
        })),
    };
});

function fixture(outputFormat: OutputFormat, maxSize = 1000000) {
    const sources: Record<string, string> = {
        'ru/index.md': '# Common\n\n:::visibility agent\n[Agent](agent.md)\n:::\n',
        'ru/agent.md': [
            '# Agent',
            '[Hidden](hidden.md?mode=raw#step)',
            '[Leading](landing.yaml)',
            '[Absolute](/ru/hidden.md)',
            '[Directory](section/)',
            '[Unknown](missing.md)',
            '[Asset](image.png)',
            '[External](https://example.com/agent.md)',
            '[Anchor](#step)',
            '[Explicit](index.md?audience=human)',
        ].join('\n\n'),
        'ru/hidden.md': '# Hidden\n\nNOINDEX_BODY\n\n[Cycle](agent.md)\n',
        'ru/section/index.md': '# Directory\n',
        'ru/landing.yaml': [
            'title: Agent landing',
            'links:',
            '  - &guide {title: Agent guide, href: agent.md}',
            '  - *guide',
            'description: |',
            '  :::visibility human',
            '  HUMAN_YAML',
            '  :::',
            '  :::visibility agent',
            '  [Hidden](hidden.md)',
            '  :::',
            'plain: some/text',
            'enabled: true',
            'empty: null',
            'recursive: &loop {self: *loop}',
        ].join('\n'),
    };
    const output = new Map<string, string>();
    const run = {
        input: '/input',
        output: '/output',
        config: {
            outputFormat,
            llms: {enabled: true, llmsFullMaxSize: maxSize},
            ai: {},
        },
        toc: {
            audience: (path: string) => {
                if (sources[path] === undefined) {
                    return undefined;
                }
                return path === 'ru/index.md' ? 'common' : 'agent';
            },
        },
        meta: {get: vi.fn(() => ({})), dump: vi.fn(async () => ({}))},
        markdown: {
            load: vi.fn(async (path: string) => sources[path] || ''),
            graph: vi.fn(async (path: string) => ({content: sources[path] || ''})),
        },
        leading: {load: vi.fn(async () => ({title: 'Agent landing'}))},
        read: vi.fn(
            async (path: string) => sources[path.replace(/\\/g, '/').replace('/input/', '')] || '',
        ),
        write: vi.fn(async (path: string, body: string) => {
            output.set(path.replace(/\\/g, '/').replace('/output/', ''), body);
        }),
        remove: vi.fn(async (path: string) => {
            output.delete(path.replace(/\\/g, '/').replace('/output/', ''));
        }),
        exists: vi.fn(() => false),
        removeOutputFiles: vi.fn(async (files: ReadonlySet<NormalizedPath>) => {
            for (const file of files) {
                output.delete(file);
            }
        }),
        logger: {error: vi.fn(), warn: vi.fn(), info: vi.fn()},
    } as unknown as Run;
    const toc = {
        path: 'ru/toc.yaml',
        title: 'Docs',
        items: [
            {href: 'index.md'},
            {href: 'agent.md'},
            {href: 'landing.yaml'},
            {href: 'hidden.md', noIndex: true},
            {href: 'section/index.md', hidden: true},
        ],
    } as unknown as Toc;
    const llms = new Llms();
    const generate = () => llms['generate'](run, toc);
    return {run, toc, llms, output, generate};
}

describe('page-audience LLMS artifacts', () => {
    it.each([1000000, 1])(
        'writes every linked static target once even when the corpus limit is %s bytes',
        async (maxSize) => {
            const {run, output, generate} = fixture(OutputFormat.html, maxSize);
            await generate();

            expect(output.get('ru/agent.agent.md')).toContain('hidden.agent.md?mode=raw#step');
            expect(output.get('ru/agent.agent.md')).toContain('section/index.agent.md');
            expect(output.get('ru/agent.agent.md')).toContain('(missing.md)');
            expect(output.get('ru/agent.agent.md')).toContain('(image.png)');
            expect(output.get('ru/agent.agent.md')).toContain('https://example.com/agent.md');
            expect(output.get('ru/hidden.agent.md')).toContain('NOINDEX_BODY');
            expect(output.get('ru/section/index.agent.md')).toContain('# Directory');
            expect(output.get('ru/llms-agent.txt')).not.toContain('hidden.agent.md');
            expect(output.get('ru/llms-full-agent.txt')).not.toContain('NOINDEX_BODY');
            expect(
                vi
                    .mocked(run.write)
                    .mock.calls.filter(([path]) => String(path).endsWith('hidden.agent.md')),
            ).toHaveLength(1);

            const leading = load(output.get('ru/landing.agent.yaml') || '') as {
                links: Array<{href: string}>;
                description: string;
                plain: string;
                enabled: boolean;
                empty: null;
                recursive: {self: unknown};
            };
            expect(leading.links.map((item) => item.href)).toEqual([
                'agent.agent.md',
                'agent.agent.md',
            ]);
            expect(leading.description).toContain('hidden.agent.md');
            expect(leading.description).not.toContain('HUMAN_YAML');
            expect(leading.plain).toBe('some/text');
            expect(leading.enabled).toBe(true);
            expect(leading.empty).toBeNull();
            expect(leading.recursive.self).toBe(leading.recursive);
        },
    );

    it('uses canonical agent URLs in dynamic output without overriding explicit audience', async () => {
        const {output, generate} = fixture(OutputFormat.md);
        await generate();

        expect(output.get('ru/llms-agent.txt')).toContain('agent.md?audience=agent');
        expect(output.get('ru/llms-agent.txt')).toContain('/llms-full.txt?audience=agent');
        const corpus = output.get('ru/llms-full-agent.txt');
        expect(corpus).toContain('hidden.md?mode=raw&audience=agent#step');
        expect(corpus).toContain('index.md?audience=human');
        expect(corpus).not.toContain('NOINDEX_BODY');
        expect(output.has(join('ru', 'agent.agent.md'))).toBe(false);
    });

    it('refreshes both index headers without recollecting articles on metadata-only watch edits', async () => {
        const {run, toc, llms, output, generate} = fixture(OutputFormat.md);
        run.config.watch = true;
        Object.assign(run.toc, {isToc: () => true, for: () => toc});
        await generate();
        const collectCalls = vi.mocked(run.markdown.load).mock.calls.length;
        const full = output.get('ru/llms-full-agent.txt');
        const agentLinks = output.get('ru/llms-agent.txt')?.split('## Documentation')[1];
        toc.llms = {description: 'Updated summary', details: 'Updated details'};

        await llms['refreshToc'](run, toc.path, true);

        for (const name of ['llms.txt', 'llms-agent.txt']) {
            expect(output.get(`ru/${name}`)).toContain('Updated summary');
            expect(output.get(`ru/${name}`)).toContain('Updated details');
        }
        expect(output.get('ru/llms-agent.txt')?.split('## Documentation')[1]).toBe(agentLinks);
        expect(output.get('ru/llms-full-agent.txt')).toBe(full);
        expect(vi.mocked(run.markdown.load)).toHaveBeenCalledTimes(collectCalls);
    });

    it('drops only the last TOC owner of each generated static target in watch mode', async () => {
        const {run, toc, llms, output, generate} = fixture(OutputFormat.html);
        run.config.watch = true;
        toc.items?.push({id: 'unlinked', href: normalizePath('unlinked.md'), name: 'Unlinked'});
        const second: Toc = {
            ...toc,
            path: normalizePath('ru/guide/toc.yaml'),
            items: [{id: 'agent', name: 'Agent', href: normalizePath('../agent.md')}],
        };
        await generate();
        await llms['generate'](run, second);
        expect(output.has('ru/unlinked.agent.md')).toBe(true);
        expect(output.has('ru/hidden.agent.md')).toBe(true);
        expect(output.has('ru/landing.agent.yaml')).toBe(true);

        run.toc.audience = () => 'common';
        await generate();
        expect(output.has('ru/unlinked.agent.md')).toBe(false);
        expect(output.has('ru/hidden.agent.md')).toBe(true);
        expect(output.has('ru/landing.agent.yaml')).toBe(true);

        await llms['generate'](run, second);
        expect([...output.keys()].filter((path) => /\.agent\.(md|yaml)$/.test(path))).toEqual([]);
        expect(output.has('ru/llms.txt')).toBe(true);
    });

    it.each([false, true])(
        'removes a released agent file with an unlisted namesake source (companions %s)',
        async (mdCompanions) => {
            const {run, toc, llms, output, generate} = fixture(OutputFormat.html);
            run.config.watch = true;
            run.config.ai.mdCompanions = mdCompanions;
            vi.mocked(run.exists).mockImplementation(
                (file) => file === join(run.input, 'ru/agent.agent.md'),
            );
            await generate();
            expect(output.get('ru/agent.agent.md')).toContain('# Agent');
            Object.assign(run.toc, {isToc: () => false});
            await llms['refreshToc'](run, toc.path, false);
            expect(output.has('ru/agent.agent.md')).toBe(false);
            expect(output.has('ru/hidden.agent.md')).toBe(false);
            expect(output.has('ru/landing.agent.yaml')).toBe(false);
        },
    );

    it('restores a shared page companion occupied by an agent file when the last owner leaves', async () => {
        const {run, toc, output, generate} = fixture(OutputFormat.html);
        run.config.watch = true;
        run.config.ai.mdCompanions = true;
        const name = normalizePath('ru/agent.agent.md');
        toc.items?.push({id: 'namesake', name: 'Authored', href: normalizePath('agent.agent.md')});
        const initialAudience = run.toc.audience;
        run.toc.audience = (path) => (path === name ? 'common' : initialAudience(path));
        const dump = vi.fn(async (file: string) => output.set(file, 'Rendered human companion'));
        Object.assign(run, {entry: {release: vi.fn(), dump}});
        output.set(name, 'Rendered human companion');
        await generate();
        expect(output.get(name)).toContain('# Agent');

        run.toc.audience = (path) =>
            path === name || initialAudience(path) ? 'common' : undefined;
        await generate();
        expect(dump.mock.calls).toEqual([[name]]);
        expect(output.get(name)).toBe('Rendered human companion');
    });

    it('removes stale agent indexes when watch edits remove the last agent page or TOC', async () => {
        const {run, toc, llms, output, generate} = fixture(OutputFormat.md);
        run.config.watch = true;
        await generate();
        expect(output.has('ru/llms-agent.txt')).toBe(true);
        run.toc.audience = () => 'common';
        await generate();
        expect(output.has('ru/llms-agent.txt')).toBe(false);
        expect(output.has('ru/llms-full-agent.txt')).toBe(false);
        expect(output.has('ru/llms.txt')).toBe(true);

        run.toc.audience = (path) => (path === 'ru/index.md' ? 'common' : 'agent');
        await generate();
        Object.assign(run.toc, {isToc: () => false});
        await llms['refreshToc'](run, toc.path, false);
        expect([...output.keys()].filter((path) => path.includes('llms'))).toEqual([]);
    });
});
