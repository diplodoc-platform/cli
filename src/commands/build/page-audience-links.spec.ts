import MarkdownIt from 'markdown-it';
import {describe, expect, it} from 'vitest';

import {findAgentPageLinks} from './page-audience-links';

describe('human links to agent-only pages', () => {
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
