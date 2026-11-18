import MarkdownIt from 'markdown-it';
import {describe, expect, it} from 'vitest';

import {findAgentPageLinks, findAgentPageTargets} from './page-audience-links';

describe('human links to agent-only pages', () => {
    it.each(['ru/agent', '/ru/agent?mode=raw#step'])(
        'resolves an extensionless document link %s',
        (href) => {
            expect(
                findAgentPageTargets(href, (path) =>
                    path === 'ru/agent.md' ? 'agent' : undefined,
                ),
            ).toEqual(['ru/agent.md']);
        },
    );

    it.each(['ru/guide.md', 'ru/guide.yaml', 'ru/guide.html', 'ru/guide'])(
        'does not replace the common document %s with an agent directory index',
        (href) => {
            const pages = new Map<string, 'agent' | 'common'>([
                ['ru/guide.md', 'common'],
                ['ru/guide.yaml', 'common'],
                ['ru/guide/index.md', 'agent'],
            ]);
            expect(findAgentPageTargets(href, (path) => pages.get(path))).toEqual([]);
            expect(findAgentPageTargets('ru/guide/', (path) => pages.get(path))).toEqual([
                'ru/guide/index.md',
            ]);
        },
    );

    it('does not resolve an explicit missing document to a directory index', () => {
        expect(
            findAgentPageTargets('ru/guide.md', (path) =>
                path === 'ru/guide/index.md' ? 'agent' : undefined,
            ),
        ).toEqual([]);
    });

    it.each(['ru/agents/a.md?mode=raw#step', '/ru/agents/a.html#step'])(
        'resolves a structured document link %s through the shared page index',
        (href) => {
            expect(
                findAgentPageTargets(href, (path) =>
                    path === 'ru/agents/a.md' ? 'agent' : 'common',
                ),
            ).toEqual(['ru/agents/a.md']);
        },
    );

    it('resolves YAML and directory targets and ignores non-document links', () => {
        const pages = new Map([
            ['ru/landing.yaml', 'agent'],
            ['ru/section/index.md', 'agent'],
        ]);
        const audience = (path: NormalizedPath) => pages.get(path) as 'agent' | undefined;
        expect(findAgentPageTargets('ru/landing.html', audience)).toEqual(['ru/landing.yaml']);
        expect(findAgentPageTargets('ru/section/', audience)).toEqual(['ru/section/index.md']);
        for (const href of [
            '',
            '?mode=raw',
            '#step',
            '*.md',
            'ru/image.png',
            'https://example.com',
        ]) {
            expect(findAgentPageTargets(href, audience)).toEqual([]);
        }
    });

    it('checks transformed root-relative paths and fragments against the page index', () => {
        const tokens = new MarkdownIt().parse('[Agent](ru/agents/a.html#step)', {});
        expect([
            ...findAgentPageLinks(tokens, (path) =>
                path === 'ru/agents/a.md' ? 'agent' : 'common',
            ),
        ]).toEqual(['ru/agents/a.md']);
    });

    it('does not confuse images, downloads, external links, or code with document links', () => {
        const tokens = new MarkdownIt().parse(
            [
                '![Image](agent.md)',
                '[Download](agent.png)',
                '[External](https://example.com/agent.md)',
                '`[Example](agent.md)`',
                '[Anchor](#agent)',
            ].join('\n'),
            {},
        );
        expect(findAgentPageLinks(tokens, () => 'agent').size).toBe(0);
    });
});
