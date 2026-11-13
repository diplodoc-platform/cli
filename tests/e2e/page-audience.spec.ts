import {access, mkdir, mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, test} from 'vitest';

import {TestAdapter} from '../fixtures';

async function fixture() {
    const root = await mkdtemp(join(await realpath(tmpdir()), 'page-audience-'));
    const input = join(root, 'input');
    for (const lang of ['ru', 'en']) {
        await mkdir(join(input, lang, 'agents'), {recursive: true});
        await writeFile(
            join(input, lang, 'toc.yaml'),
            [
                `title: Docs ${lang}`,
                'href: index.md',
                'items:',
                '  - name: Common',
                '    href: index.md',
                '  - name: Agent section',
                '    visibility: agent',
                '    include:',
                '      path: agents/toc.yaml',
                '      mode: link',
                '',
            ].join('\n'),
        );
        await writeFile(
            join(input, lang, 'agents/toc.yaml'),
            'items:\n  - name: Agent instructions\n    href: agent.md\n',
        );
        await writeFile(
            join(input, lang, 'index.md'),
            '# Common\n\nShared instructions.\n\n:::visibility agent\n[Agent](agents/agent.md)\n:::\n',
        );
        await writeFile(
            join(input, lang, 'agents/agent.md'),
            [
                '# Agent instructions',
                '',
                'AGENT_PAGE_CONTENT',
                '',
                ':::visibility human',
                'HUMAN_ONLY_CONTENT',
                ':::',
                '',
                ':::visibility agent',
                'AGENT_ONLY_STEPS',
                ':::',
                '',
            ].join('\n'),
        );
    }
    await writeFile(join(input, '.yfm'), 'langs: [ru, en]\nlang: ru\n');
    return {root, input, output: join(root, 'output')};
}

describe('page audiences', () => {
    test('allows agent-to-agent links while collecting anchors', async () => {
        const {root, input, output} = await fixture();
        try {
            await writeFile(
                join(input, 'ru/index.md'),
                '# Common\n\n:::visibility agent\n[Agent](agents/agent.md#agent-instructions)\n:::\n',
            );
            await writeFile(
                join(input, 'ru/agents/toc.yaml'),
                'items:\n  - href: agent.md\n  - href: second.md\n',
            );
            await writeFile(
                join(input, 'ru/agents/agent.md'),
                '# Agent instructions\n\n[Next agent](second.md)\n',
            );
            await writeFile(join(input, 'ru/agents/second.md'), '# Second agent\n');
            await TestAdapter.testBuildPass(input, output, {
                md2md: true,
                md2html: false,
                args: '--llms',
            });
            expect(await readFile(join(output, 'ru/llms-full-agent.txt'), 'utf8')).toContain(
                'second.md?audience=agent',
            );
        } finally {
            await rm(root, {recursive: true, force: true});
        }
    });

    test.each(['ru', 'en'])('diagnoses a human-visible localized link in %s', async (lang) => {
        const {root, input, output} = await fixture();
        try {
            await writeFile(
                join(input, lang, 'index.md'),
                '# Common\n\n[Agent](agents/agent.md)\n',
            );
            const report = await TestAdapter.build.run(input, output, ['-f', 'html']);
            expect(report.code).not.toBe(0);
            expect(report.errors.join('\n')).toContain(
                `Human page ${lang}/index.md links to agent-only page ${lang}/agents/agent.md`,
            );
        } finally {
            await rm(root, {recursive: true, force: true});
        }
    });

    test('writes linked noIndex and YAML agent artifacts without indexing excluded pages', async () => {
        const {root, input, output} = await fixture();
        try {
            await writeFile(
                join(input, 'ru/agents/toc.yaml'),
                'visibility: agent\nitems:\n  - href: agent.md\n',
            );
            await writeFile(
                join(input, 'ru/toc.yaml'),
                [
                    'title: Docs',
                    'items:',
                    '  - href: index.md',
                    '  - href: hidden.md',
                    '    noIndex: true',
                    '  - href: secret.md',
                    '    visibility: agent',
                    '    noIndex: true',
                    '  - href: landing.yaml',
                    '    visibility: agent',
                    '  - href: agents/agent.md',
                    '    visibility: agent',
                ].join('\n'),
            );
            await writeFile(
                join(input, 'ru/agents/agent.md'),
                '# Agent instructions\n\n[Not indexed](../hidden.md)\n\n[Landing](../landing.yaml)\n',
            );
            await writeFile(
                join(input, 'ru/hidden.md'),
                '# NoIndex\n\nNOINDEX_CONTENT\n\n:::visibility human\nHUMAN_NO_INDEX\n:::\n\n:::visibility agent\n[Cycle](agents/agent.md)\n:::\n',
            );
            await writeFile(join(input, 'ru/secret.md'), '# Secret\nSECRET_NOINDEX_CONTENT\n');
            await writeFile(
                join(input, 'ru/landing.yaml'),
                'title: Agent landing\nlinks:\n  - title: Agent guide\n    href: agents/agent.md\n  - title: Not indexed agent\n    href: secret.md\n',
            );
            await TestAdapter.testBuildPass(input, output, {
                md2md: false,
                md2html: true,
                args: '--llms',
            });
            const agent = await readFile(join(output, 'ru/agents/agent.agent.md'), 'utf8');
            expect(agent).toContain('../hidden.agent.md');
            expect(agent).toContain('../landing.agent.yaml');
            const hidden = await readFile(join(output, 'ru/hidden.agent.md'), 'utf8');
            expect(hidden).toContain('NOINDEX_CONTENT');
            expect(hidden).not.toContain('HUMAN_NO_INDEX');
            const landing = await readFile(join(output, 'ru/landing.agent.yaml'), 'utf8');
            expect(landing).toContain('agents/agent.agent.md');
            expect(landing).toContain('secret.agent.md');
            expect(await readFile(join(output, 'ru/secret.agent.md'), 'utf8')).toContain(
                'SECRET_NOINDEX_CONTENT',
            );
            for (const file of ['llms-agent.txt', 'llms-full-agent.txt']) {
                const content = await readFile(join(output, 'ru', file), 'utf8');
                expect(content).not.toContain('NOINDEX_CONTENT');
                if (file === 'llms-agent.txt') {
                    expect(content).not.toContain('hidden.agent.md');
                    expect(content).not.toContain('secret.agent.md');
                }
            }
        } finally {
            await rm(root, {recursive: true, force: true});
        }
    });

    test.each(['', '--jobs 2'])(
        'preserves agent sources and generates distinct discovery artifacts %s',
        async (jobs) => {
            const {root, input, output} = await fixture();
            try {
                await TestAdapter.testBuildPass(input, output, {
                    md2md: true,
                    md2html: false,
                    args: `--llms --build-manifest ${jobs}`,
                });
                for (const lang of ['ru', 'en']) {
                    const dir = join(output, lang);
                    const source = await readFile(join(dir, 'agents/agent.md'), 'utf8');
                    expect(source).toContain('pageAudience: agent');
                    expect(source).toContain('HUMAN_ONLY_CONTENT');
                    expect(source).toContain('AGENT_ONLY_STEPS');
                    expect(await readFile(join(dir, 'toc.yaml'), 'utf8')).toContain(
                        'visibility: agent',
                    );
                    expect(await readFile(join(dir, 'llms.txt'), 'utf8')).not.toContain(
                        'agents/agent',
                    );
                    expect(await readFile(join(dir, 'llms-full.txt'), 'utf8')).not.toContain(
                        'AGENT_PAGE_CONTENT',
                    );
                    expect(await readFile(join(dir, 'llms-agent.txt'), 'utf8')).toContain(
                        'audience=agent',
                    );
                    const agent = await readFile(join(dir, 'llms-full-agent.txt'), 'utf8');
                    expect(agent).toContain('AGENT_PAGE_CONTENT');
                    expect(agent).toContain('AGENT_ONLY_STEPS');
                    expect(agent).toContain('agents/agent.md?audience=agent');
                    expect(agent).not.toContain('HUMAN_ONLY_CONTENT');
                }
            } finally {
                await rm(root, {recursive: true, force: true});
            }
        },
    );

    test('excludes agent pages from navigation, search export, sitemap, and the single-page/PDF source', async () => {
        const {root, input, output} = await fixture();
        try {
            await TestAdapter.testBuildPass(input, output, {
                md2md: false,
                md2html: true,
                args: '--llms --search-index --sitemap --base-href https://example.com/docs/',
            });
            const search = await readFile(join(output, '_search/documents.json'), 'utf8');
            expect(search).not.toContain('AGENT_PAGE_CONTENT');
            expect(search).not.toContain('agents/agent');
            expect(JSON.parse(search).documents).toHaveLength(2);
            for (const lang of ['ru', 'en']) {
                const dir = join(output, lang);
                await expect(access(join(dir, 'agents/agent.html'))).rejects.toThrow();
                expect(await readFile(join(dir, 'toc.js'), 'utf8')).not.toContain(
                    'Agent instructions',
                );
                expect(await readFile(join(output, 'sitemap.xml'), 'utf8')).not.toContain(
                    'agents/agent',
                );
                expect(await readFile(join(dir, 'agents/agent.agent.md'), 'utf8')).toContain(
                    'AGENT_ONLY_STEPS',
                );
                expect(await readFile(join(dir, 'agents/agent.agent.md'), 'utf8')).not.toContain(
                    'HUMAN_ONLY_CONTENT',
                );
                expect(await readFile(join(dir, 'index.agent.md'), 'utf8')).toContain(
                    'agents/agent.agent.md',
                );
            }
            await TestAdapter.testBuildPass(input, output, {
                md2md: false,
                md2html: true,
                args: '--single-page',
            });
            for (const lang of ['ru', 'en']) {
                expect(
                    await readFile(join(output, lang, 'single-page.html'), 'utf8'),
                ).not.toContain('AGENT_PAGE_CONTENT');
            }
        } finally {
            await rm(root, {recursive: true, force: true});
        }
    });
});
