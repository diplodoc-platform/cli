import {describe, expect, it} from 'vitest';
import MarkdownIt from 'markdown-it';

import includes, {contentWithoutFrontmatter} from './includes';
import includesDetect from './includes-detect';

/**
 * Include file content as written by md2md (with csp/metadata frontmatter).
 * When such content is passed to md.parse() without stripping frontmatter,
 * the YAML is rendered as markdown and appears as visible text (bug).
 */
const includeContentWithFrontmatter = `---
csp:
  - style-src:
      - unsafe-inline
  - connect-src:
      - uaas.yandex.ru
vcsPath: docs/_includes/support.md
---

Body only. No metadata in output.`;

const log = {error: () => {}, warn: () => {}, info: () => {}};

describe('includes plugin: frontmatter in included content', () => {
    it('full plugin chain: with fix no metadata in HTML, without fix metadata leaks (regression test)', () => {
        const md = new MarkdownIt();
        const options = {
            path: 'page.md',
            files: {'inc.md': includeContentWithFrontmatter} as Record<string, string>,
            log,
        };
        md.use(includesDetect, options);
        md.use(includes, options);

        const tokens = md.parse('# Page\n\n{% include notitle [x](inc.md) %}', {path: 'page.md'});
        const html = md.renderer.render(tokens, md.options, {});

        expect(html).not.toMatch(/style-src:\s*unsafe-inline/);
        expect(html).not.toMatch(/vcsPath:\s*docs\/_includes\/support\.md/);
        expect(html).toMatch(/Body only\. No metadata in output/);
    });

    it('with fix: contentWithoutFrontmatter strips frontmatter, rendered HTML has no metadata', () => {
        const body = contentWithoutFrontmatter(includeContentWithFrontmatter);
        const md = new MarkdownIt();
        const html = md.render(body);

        expect(html).not.toMatch(/style-src:\s*unsafe-inline/);
        expect(html).not.toMatch(/connect-src:\s*uaas\.yandex\.ru/);
        expect(html).not.toMatch(/vcsPath:\s*docs\/_includes\/support\.md/);
        expect(html).toMatch(/Body only\. No metadata in output/);
    });

    it('without fix: parsing raw content leaks metadata into HTML (bug reproducer)', () => {
        const md = new MarkdownIt();
        const htmlFromRaw = md.render(includeContentWithFrontmatter);

        expect(htmlFromRaw).toMatch(/style-src/);
        expect(htmlFromRaw).toMatch(/vcsPath/);
    });

    it('contentWithoutFrontmatter returns full content when there is no frontmatter', () => {
        const plain = 'Just body.\nNo frontmatter.';
        expect(contentWithoutFrontmatter(plain)).toBe(plain);
    });
});
