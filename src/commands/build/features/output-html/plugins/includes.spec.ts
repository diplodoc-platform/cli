import {describe, expect, it} from 'vitest';
import MarkdownIt from 'markdown-it';
import attrs from 'markdown-it-attrs';

import includes, {contentWithoutFrontmatter, mergeNestedMeta} from './includes';
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

describe('mergeNestedMeta', () => {
    it('does nothing when nestedMeta is undefined', () => {
        const env: Record<string, unknown> = {};
        mergeNestedMeta(env, undefined);
        expect(env.meta).toBeUndefined();
    });

    it('does nothing when nestedMeta has no script or style', () => {
        const env: Record<string, unknown> = {};
        mergeNestedMeta(env, {title: 'foo'});
        expect((env.meta as Record<string, unknown>)?.script).toBeUndefined();
        expect((env.meta as Record<string, unknown>)?.style).toBeUndefined();
    });

    it('initializes parent meta but adds no entries when nestedMeta has empty arrays', () => {
        const env: Record<string, unknown> = {};
        mergeNestedMeta(env, {script: [], style: []});
        expect(env.meta).toBeDefined();
        const meta = env.meta as Record<string, unknown>;
        expect(meta.script).toBeUndefined();
        expect(meta.style).toBeUndefined();
    });

    it('merges script from nested into empty parent', () => {
        const env: Record<string, unknown> = {};
        mergeNestedMeta(env, {script: ['mermaid-runtime.js']});
        const meta = env.meta as Record<string, string[]>;
        expect(meta.script).toEqual(['mermaid-runtime.js']);
    });

    it('merges style from nested into empty parent', () => {
        const env: Record<string, unknown> = {};
        mergeNestedMeta(env, {style: ['cut-extension.css']});
        const meta = env.meta as Record<string, string[]>;
        expect(meta.style).toEqual(['cut-extension.css']);
    });

    it('merges both script and style', () => {
        const env: Record<string, unknown> = {};
        mergeNestedMeta(env, {
            script: ['mermaid-runtime.js'],
            style: ['cut-extension.css'],
        });
        const meta = env.meta as Record<string, string[]>;
        expect(meta.script).toEqual(['mermaid-runtime.js']);
        expect(meta.style).toEqual(['cut-extension.css']);
    });

    it('appends to existing parent meta without duplicates', () => {
        const env: Record<string, unknown> = {
            meta: {script: ['app.js'], style: ['app.css']},
        };
        mergeNestedMeta(env, {
            script: ['app.js', 'mermaid-runtime.js'],
            style: ['cut-extension.css'],
        });
        const meta = env.meta as Record<string, string[]>;
        expect(meta.script).toEqual(['app.js', 'mermaid-runtime.js']);
        expect(meta.style).toEqual(['app.css', 'cut-extension.css']);
    });

    it('deduplicates across multiple merge calls', () => {
        const env: Record<string, unknown> = {};
        mergeNestedMeta(env, {script: ['a.js', 'b.js']});
        mergeNestedMeta(env, {script: ['b.js', 'c.js']});
        const meta = env.meta as Record<string, string[]>;
        expect(meta.script).toEqual(['a.js', 'b.js', 'c.js']);
    });

    it('uses setter when parentEnv has meta getter/setter', () => {
        let backing: Record<string, unknown> = {};
        const env: Record<string, unknown> = {
            get meta() {
                return backing;
            },
            set meta(v: unknown) {
                backing = v as Record<string, unknown>;
            },
        };
        mergeNestedMeta(env, {script: ['ext.js']});
        expect(backing.script).toEqual(['ext.js']);
    });
});

describe('includes plugin: metadata propagation from included files', () => {
    function mockExtensionPlugin(runtime: string) {
        return (md: MarkdownIt) => {
            md.core.ruler.push('mock-ext', (state) => {
                const {env} = state;
                if (env.path === 'page.md') {
                    return;
                }
                env.meta = env.meta || {};
                env.meta.script = env.meta.script || [];
                env.meta.script.push(runtime);
            });
        };
    }

    it('propagates extension metadata from included file to parent env', () => {
        const md = new MarkdownIt();
        const options = {
            path: 'page.md',
            files: {'inc.md': '# Inc\n\nContent'} as Record<string, string>,
            log,
        };

        md.use(includesDetect, options);
        md.use(includes, options);
        md.use(mockExtensionPlugin('mock-runtime.js'));

        const env: Record<string, unknown> = {path: 'page.md'};
        md.parse('# Page\n\n{% include [x](inc.md) %}', env);

        const meta = env.meta as Record<string, string[]>;
        expect(meta.script).toContain('mock-runtime.js');
    });

    it('propagates metadata on cache hit (second include of same file)', () => {
        const md = new MarkdownIt();
        const options = {
            path: 'page.md',
            files: {'inc.md': '# Inc\n\nContent'} as Record<string, string>,
            log,
        };

        md.use(includesDetect, options);
        md.use(includes, options);
        md.use(mockExtensionPlugin('mock-runtime.js'));

        const env: Record<string, unknown> = {path: 'page.md'};
        md.parse('{% include [x](inc.md) %}\n\n{% include [y](inc.md) %}', env);

        const meta = env.meta as Record<string, string[]>;
        const count = meta.script.filter((s: string) => s === 'mock-runtime.js').length;
        expect(count).toBe(1);
    });
});

/**
 * Regression for the case observed in alice/_includes/reusables.md
 * (#quick-notifications) + neuroexpert-button.md (Bug 31): when an
 * include resolves to zero tokens (`notitle` on a heading-only section,
 * or a liquid `{% if %}` block whose branches all evaluated to empty),
 * the synthetic include token is spliced out (`splice(index, 1)`).  If
 * the next sibling token is another `include`, `filterTokens` used to
 * skip it, leaving a synthetic token in the stream that the default
 * renderer rendered as malformed `< path="..." keyword="...">` HTML.
 *
 * Affected 627 HTML files in the alice doc set alone.
 */
describe('includes plugin: empty include followed by another include (Bug 31)', () => {
    it('processes the second include when the first resolves to empty (notitle + heading-only section)', () => {
        const md = new MarkdownIt({html: true});
        const options = {
            path: 'page.md',
            files: {
                'empty.md': '#### Heading {#anchor}\n',
                'real.md': '<div style="display: none;"> </div>',
            } as Record<string, string>,
            log,
        };

        md.use(includesDetect, options);
        md.use(includes, options);

        const tokens = md.parse(
            '{% include notitle [a](empty.md#anchor) %}\n\n{% include notitle [b](real.md) %}',
            {path: 'page.md'},
        );
        const html = md.renderer.render(tokens, md.options, {});

        expect(html).not.toMatch(/&lt; path=/);
        expect(html).not.toMatch(/< path=/);
        expect(html).toContain('<div style="display: none;">');
    });

    it('processes the second include when the first include body is empty markdown', () => {
        const md = new MarkdownIt({html: true});
        const options = {
            path: 'page.md',
            files: {
                'empty.md': '',
                'real.md': '<style>.x { display: none; }</style>',
            } as Record<string, string>,
            log,
        };

        md.use(includesDetect, options);
        md.use(includes, options);

        const tokens = md.parse('{% include [a](empty.md) %}\n\n{% include [b](real.md) %}', {
            path: 'page.md',
        });
        const html = md.renderer.render(tokens, md.options, {});

        expect(html).not.toMatch(/< path=/);
        expect(html).toContain('<style>.x { display: none; }</style>');
    });

    it('keeps section content when a nested include introduces a shallower heading (Bug 33)', () => {
        // `#### {#section}` (h4) whose body is a nested include that expands
        // to `### {#inner}` (h3) + content.  `cutHeading` must end the
        // section only at the next h4, not at the shallower h3 — otherwise
        // the notitle include collapses to nothing.  Matches transform's
        // findBlockTokens and merge-includes.  Surfaced on alice unruly.md.
        // markdown-it-attrs is required so `{#id}` becomes a real id attr
        // (as in the production transform pipeline) for cutTokens to match.
        // Plugin registration order mirrors production (attrs → includes →
        // includesDetect): `includes` registers `before('curly_attributes')`
        // and `includesDetect` registers `before('includes')`, yielding the
        // correct ruler order [includes_detect, includes, curly_attributes].
        const md = new MarkdownIt({html: true});
        md.use(attrs, {leftDelimiter: '{', rightDelimiter: '}'});
        const options = {
            path: 'page.md',
            files: {
                'reusables.md':
                    '# Title\n\n#### Section {#section}\n\n{% include [inner](inner.md) %}\n',
                'inner.md': '### {#inner}\n\n<div class="telegram-btn">btn</div>\n',
            } as Record<string, string>,
            log,
        };

        md.use(includes, options);
        md.use(includesDetect, options);

        const tokens = md.parse('{% include notitle [s](reusables.md#section) %}', {
            path: 'page.md',
        });
        const html = md.renderer.render(tokens, md.options, {});

        expect(html).toContain('telegram-btn');
        expect(html).not.toMatch(/< path=/);
    });

    it('keeps the token cache canonical across separate parses of the same #hash (Bug 34)', () => {
        // The plugin caches parsed include files in a closure shared by every
        // `md.parse` on the same `md` instance (CLI reuses one instance for all
        // entries).  A `#hash` section is extracted with `cutTokens`/`cutHeading`
        // from the cached tree.  Previously only cache *hits* copied tokens, so
        // the first (cache-miss) consumer spliced the ORIGINAL cached tokens
        // into the stream, where later core rules (`curly_attributes`) and
        // `tagTokensWithSource` mutated them in place — corrupting the cache.
        // A subsequent parse of the same `#hash` then read the mutated tree and
        // produced different output.  Under `-j2` the seeding order is
        // non-deterministic, so the regression e2e snapshot flaked (a `#f1` h3
        // section randomly kept/dropped the sibling `## F2` h2).  Two separate
        // parses of the same include must yield identical HTML.
        const frag =
            '### F1 {#f1}\n\nContent F1\n\n## F2 {#f2}\n\nContent F2\n\n### F3 {#f3}\n\nContent F3\n';
        const options = {
            path: 'page.md',
            files: {'frag.md': frag} as Record<string, string>,
            log,
        };

        const build = () => {
            const md = new MarkdownIt({html: true});
            md.use(attrs, {leftDelimiter: '{', rightDelimiter: '}'});
            md.use(includes, options);
            md.use(includesDetect, options);
            return md;
        };

        // `#f1` (h3) must span the shallower `## F2` (h2) and stop at the next
        // h3 (`### F3`) — matching the viewer's findBlockTokens.
        const md = build();
        const first = md.renderer.render(
            md.parse('{% include [a](frag.md#f1) %}', {path: 'a.md'}),
            md.options,
            {},
        );
        const second = md.renderer.render(
            md.parse('{% include [b](frag.md#f1) %}', {path: 'b.md'}),
            md.options,
            {},
        );

        expect(first).toContain('Content F1');
        expect(first).toContain('Content F2');
        expect(first).not.toContain('Content F3');
        // The cache-hit parse must match the cache-miss parse exactly.
        expect(second).toBe(first);
    });

    it('processes three consecutive includes when middle one resolves to empty', () => {
        const md = new MarkdownIt({html: true});
        const options = {
            path: 'page.md',
            files: {
                'first.md': 'First content.',
                'empty.md': '#### Heading {#anchor}\n',
                'last.md': 'Last content.',
            } as Record<string, string>,
            log,
        };

        md.use(includesDetect, options);
        md.use(includes, options);

        const tokens = md.parse(
            '{% include [a](first.md) %}\n\n{% include notitle [b](empty.md#anchor) %}\n\n{% include [c](last.md) %}',
            {path: 'page.md'},
        );
        const html = md.renderer.render(tokens, md.options, {});

        expect(html).not.toMatch(/< path=/);
        expect(html).toContain('First content.');
        expect(html).toContain('Last content.');
    });
});
