import type {MarkdownItPluginCb} from '@diplodoc/transform/lib/typings';

import {describe, expect, it} from 'vitest';
import MarkdownIt from 'markdown-it';
import anchors from '@diplodoc/transform/lib/plugins/anchors';
import blockAnchor from '@diplodoc/transform/lib/plugins/block-anchor';

import {collectAnchorIds} from './collect';

type AnchorsOptions = {
    extractTitle?: boolean;
    supportGithubAnchors?: boolean;
};

function collect(markdown: string, options: AnchorsOptions = {}) {
    const md = new MarkdownIt({html: true});

    md.use(blockAnchor);
    md.use(anchors as unknown as MarkdownItPluginCb<AnchorsOptions>, {
        path: 'index.md',
        log: {warn() {}, error() {}},
        transformLink: (v: string) => v,
        getPublicPath: () => '',
        extractTitle: false,
        ...options,
    });

    const tokens = md.parse(markdown, {});
    const anchorIds = new Set<string>();
    collectAnchorIds(tokens, anchorIds);

    return anchorIds;
}

describe('collectAnchorIds', () => {
    it('collects a slugified heading anchor', () => {
        const anchorIds = collect('## Automatic heading');

        expect(anchorIds.has('automatic-heading')).toBe(true);
    });

    it('collects a custom {#id} heading anchor', () => {
        const anchorIds = collect('## Plutonium {#over-plutonium}');

        expect(anchorIds.has('over-plutonium')).toBe(true);
    });

    it('collects numbered ids for duplicate headings', () => {
        const anchorIds = collect(['## Duplicate heading', '', '## Duplicate heading'].join('\n'));

        expect(anchorIds.has('duplicate-heading')).toBe(true);
        expect(anchorIds.has('duplicate-heading1')).toBe(true);
    });

    it('collects a block {% anchor %} id', () => {
        const anchorIds = collect('{% anchor block-anchor %}');

        expect(anchorIds.has('block-anchor')).toBe(true);
    });

    it('collects GitHub-style anchors when enabled', () => {
        const anchorIds = collect('## Automatic heading', {supportGithubAnchors: true});

        expect(anchorIds.has('automatic-heading')).toBe(true);
    });

    it('transliterates automatic non-ASCII heading anchors', () => {
        const anchorIds = collect('## Раздел');

        // Automatic slugs are transliterated by the anchors plugin, so the id
        // is ASCII regardless of the heading language.
        expect(anchorIds.has('razdel')).toBe(true);
    });

    it('keeps custom non-ASCII {#id} anchors in their decoded form', () => {
        const anchorIds = collect('## Раздел {#раздел}');

        // Custom ids are stored as-authored (decoded). The link plugin also
        // decodes hashes before comparison, so a percent-encoded link to this
        // anchor must match.
        expect(anchorIds.has('раздел')).toBe(true);
    });
});
