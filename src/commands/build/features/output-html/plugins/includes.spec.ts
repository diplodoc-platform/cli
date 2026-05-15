import {describe, expect, it} from 'vitest';
import MarkdownIt from 'markdown-it';

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
