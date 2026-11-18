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
    test('diagnoses human links to extensionless agent documents', async () => {
        const {root, input, output} = await fixture();
        try {
            await writeFile(join(input, 'ru/index.md'), '# Common\n\n[Agent](agents/agent)\n');
            const report = await TestAdapter.build.run(input, output, ['-f', 'html']);
            expect(report.code).not.toBe(0);
            expect(report.errors.join('\n')).toContain(
                'Human page ru/index.md links to agent-only page ru/agents/agent.md',
            );
        } finally {
            await rm(root, {recursive: true, force: true});
        }
    });

    test('keeps a common file distinct from an agent directory index', async () => {
        const {root, input, output} = await fixture();
        try {
            await mkdir(join(input, 'ru/guide'), {recursive: true});
            await writeFile(
                join(input, 'ru/toc.yaml'),
                'items:\n  - href: index.md\n  - href: guide.md\n  - href: guide/index.md\n    visibility: agent\n',
            );
            await writeFile(join(input, 'ru/index.md'), '# Common\n\n[Guide](guide.md)\n');
            await writeFile(join(input, 'ru/guide.md'), '# Common guide\n');
            await writeFile(join(input, 'ru/guide/index.md'), '# Agent directory\n');
            await TestAdapter.testBuildPass(input, output, {md2md: false, md2html: true});
            expect(await readFile(join(output, 'ru/index.html'), 'utf8')).toContain('guide.html');
        } finally {
            await rm(root, {recursive: true, force: true});
        }
    });

    test('rewrites extensionless agent links in dynamic and static corpora', async () => {
        const {root, input, output} = await fixture();
        try {
            await writeFile(
                join(input, 'ru/agents/toc.yaml'),
                'items:\n  - href: agent.md\n  - href: second.md\n',
            );
            await writeFile(
                join(input, 'ru/agents/agent.md'),
                '# Agent\n\n[Next](second?mode=raw#step)\n',
            );
            await writeFile(join(input, 'ru/agents/second.md'), '# Step\n');
            await TestAdapter.testBuildPass(input, output, {
                md2md: true,
                md2html: false,
                args: '--llms',
            });
            expect(await readFile(join(output, 'ru/llms-full-agent.txt'), 'utf8')).toContain(
                'second?mode=raw&audience=agent#step',
            );

            const htmlOutput = join(root, 'html');
            await TestAdapter.testBuildPass(input, htmlOutput, {
                md2md: false,
                md2html: true,
                args: '--llms',
            });
            expect(await readFile(join(htmlOutput, 'ru/agents/agent.agent.md'), 'utf8')).toContain(
                'second.agent.md?mode=raw#step',
            );
        } finally {
            await rm(root, {recursive: true, force: true});
        }
    });

    test('links each localized static agent index to its full corpus without a base href', async () => {
        const {root, input, output} = await fixture();
        try {
            await TestAdapter.testBuildPass(input, output, {
                md2md: false,
                md2html: true,
                args: '--llms',
            });
            for (const lang of ['ru', 'en']) {
                const index = await readFile(join(output, lang, 'llms-agent.txt'), 'utf8');
                const href = index.match(/\[llms-full-agent\.txt\]\(([^)]+)\)/)?.[1] ?? '';
                const indexUrl = new URL(`https://example.org/docs/${lang}/llms-agent.txt`);
                expect(new URL(href, indexUrl).href).toBe(
                    `https://example.org/docs/${lang}/llms-full-agent.txt`,
                );
                const corpus = await readFile(join(output, lang, 'llms-full-agent.txt'), 'utf8');
                expect(corpus).toContain(`# Docs ${lang}`);
                expect(corpus).toContain('AGENT_ONLY_STEPS');
            }
        } finally {
            await rm(root, {recursive: true, force: true});
        }
    });

    test('rewrites structured directory and extensionless hrefs without changing YAML prose', async () => {
        const {root, input, output} = await fixture();
        try {
            const toc = await readFile(join(input, 'ru/toc.yaml'), 'utf8');
            await writeFile(
                join(input, 'ru/toc.yaml'),
                toc.replace(
                    '  - name: Common',
                    '  - href: landing.yaml\n    visibility: agent\n  - name: Common',
                ),
            );
            await writeFile(
                join(input, 'ru/agents/toc.yaml'),
                'items:\n  - href: index.md\n  - href: agent.md\n',
            );
            await writeFile(join(input, 'ru/agents/index.md'), '# Agent index\n');
            await writeFile(
                join(input, 'ru/landing.yaml'),
                'title: agents/\nlinks:\n  - title: Directory\n    href: agents/\n  - title: Document\n    href: agents/agent\n',
            );
            await TestAdapter.testBuildPass(input, output, {
                md2md: false,
                md2html: true,
                args: '--llms',
            });
            const landing = await readFile(join(output, 'ru/landing.agent.yaml'), 'utf8');
            expect(landing).toContain('href: agents/index.agent.md');
            expect(landing).toContain('href: agents/agent.agent.md');
            expect(landing).toContain('title: agents/');
        } finally {
            await rm(root, {recursive: true, force: true});
        }
    });

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

    test.each([
        ['--no-lint', '1'],
        ['--lint', '2'],
    ])('checks human-visible links in Viewer Markdown (%s, jobs=%s)', async (lint, jobs) => {
        const {root, input, output} = await fixture();
        try {
            for (const lang of ['ru', 'en']) {
                const dir = join(input, lang);
                await writeFile(join(dir, 'agents', 'included.md'), '# Included target\n');
                const agentToc = join(dir, 'agents', 'toc.yaml');
                await writeFile(
                    agentToc,
                    (await readFile(agentToc, 'utf8')) + '  - href: included.md\n',
                );
                await mkdir(join(dir, '_includes'));
                await writeFile(
                    join(dir, '_includes', 'wrapper.md'),
                    '{% include [Links](links.md) %}\n',
                );
                await writeFile(
                    join(dir, '_includes', 'links.md'),
                    '[Details](../agents/included)\n',
                );
                await writeFile(
                    join(dir, 'index.md'),
                    '# Common\n\n{% include [Links](_includes/links.md) %}\n\n[More][target]\n\n[target]: agents/agent.md?mode=raw#step\n',
                );
                const toc = await readFile(join(dir, 'toc.yaml'), 'utf8');
                await writeFile(join(dir, 'toc.yaml'), toc + '  - href: landing.yaml\n');
                await writeFile(
                    join(dir, 'landing.yaml'),
                    'title: Shared\nblocks:\n  - type: card-layout-block\n    children:\n      - type: basic-card\n        text: |\n          [Details](agents/agent.md)\n\n          {% include [Wrapper](_includes/wrapper.md) %}\n',
                );
            }
            const report = await TestAdapter.build.run(input, output, [
                '-f',
                'md',
                lint,
                '-j',
                jobs,
            ]);
            expect(report.code).not.toBe(0);
            const errors = report.errors.join('\n');
            for (const lang of ['ru', 'en']) {
                for (const page of ['index.md', 'landing.yaml']) {
                    expect(errors).toContain(
                        `Human page ${lang}/${page} links to agent-only page ${lang}/agents/included.md`,
                    );
                    expect(errors).toContain(
                        `Human page ${lang}/${page} links to agent-only page ${lang}/agents/agent.md`,
                    );
                }
            }
        } finally {
            await rm(root, {recursive: true, force: true});
        }
    });

    test('preserves agent-only links in Viewer sources and ignores Markdown code examples', async () => {
        const {root, input, output} = await fixture();
        try {
            const source = [
                '# Shared',
                '',
                ':::visibility agent',
                '[Details](agents/agent.md)',
                ':::',
                '',
                '`[inline example](agents/agent.md)`',
                '',
                '```md',
                '[fenced example](agents/agent.md)',
                '```',
                '',
                '[unused]: agents/agent.md',
            ].join('\n');
            await writeFile(join(input, 'ru/index.md'), source);
            await TestAdapter.testBuildPass(input, output, {md2md: true, md2html: false});
            expect(await readFile(join(output, 'ru/index.md'), 'utf8')).toContain(source);
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

    test.each([
        ['ru', ''],
        ['en', ''],
        ['ru', '--jobs 2'],
        ['en', '--jobs 2'],
    ])('diagnoses a structured link from a human YAML page in %s %s', async (lang, jobs) => {
        const {root, input, output} = await fixture();
        try {
            await writeFile(
                join(input, lang, 'toc.yaml'),
                (await readFile(join(input, lang, 'toc.yaml'), 'utf8')).replace(
                    '  - name: Agent section',
                    '  - href: landing.yaml\n  - name: Agent section',
                ),
            );
            await writeFile(
                join(input, lang, 'landing.yaml'),
                'title: Human landing\nlinks:\n  - title: Agent guide\n    href: agents/agent.md\n',
            );

            const report = await TestAdapter.build.run(input, output, [
                '-f',
                'html',
                ...jobs.split(' ').filter(Boolean),
            ]);
            expect(report.code).not.toBe(0);
            expect(report.errors.join('\n')).toContain(
                `Human page ${lang}/landing.yaml links to agent-only page ${lang}/agents/agent.md`,
            );
        } finally {
            await rm(root, {recursive: true, force: true});
        }
    });

    test.each(['#step', '?mode=raw'])(
        'does not diagnose a pathless YAML link %s as the agent-only directory index',
        async (href) => {
            const {root, input, output} = await fixture();
            try {
                await writeFile(
                    join(input, 'ru/toc.yaml'),
                    'title: Docs\nitems:\n  - href: landing.yaml\n  - href: index.md\n    visibility: agent\n',
                );
                await writeFile(
                    join(input, 'ru/landing.yaml'),
                    `title: Human landing\nlinks:\n  - title: Local link\n    href: '${href}'\n`,
                );
                await TestAdapter.testBuildPass(input, output, {md2md: false, md2html: true});
            } finally {
                await rm(root, {recursive: true, force: true});
            }
        },
    );

    test('preserves ordinary structured YAML links and Markdown sources', async () => {
        const {root, input, output} = await fixture();
        try {
            const agentToc = await readFile(join(input, 'ru/toc.yaml'), 'utf8');
            await writeFile(
                join(input, 'ru/toc.yaml'),
                'title: Docs\nitems:\n  - href: index.md\n  - href: landing.yaml\n',
            );
            await writeFile(join(input, 'ru/index.md'), '# Common\n');
            await writeFile(
                join(input, 'ru/landing.yaml'),
                'title: Human landing\nlinks:\n  - title: Common guide\n    href: index.md\n',
            );
            await TestAdapter.testBuildPass(input, output, {md2md: false, md2html: true});
            expect(await readFile(join(output, 'ru/landing.html'), 'utf8')).toContain('index.html');

            await writeFile(
                join(input, 'ru/toc.yaml'),
                agentToc.replace('  - name: Common', '  - href: landing.yaml\n  - name: Common'),
            );
            const source =
                'title: Human landing\nlinks:\n  - title: Agent preview\n    href: agents/agent.md?audience=agent\n';
            await writeFile(join(input, 'ru/landing.yaml'), source);
            await TestAdapter.testBuildPass(input, output, {md2md: true, md2html: false});
            expect(await readFile(join(output, 'ru/landing.yaml'), 'utf8')).toContain(
                'agents/agent.md?audience=agent',
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
