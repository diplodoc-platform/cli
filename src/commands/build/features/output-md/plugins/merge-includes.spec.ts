import type {HashedGraphNode} from '../utils';

import {describe, expect, it} from 'vitest';

import {Scheduler} from '../utils';

import {
    addFallbackDep,
    canInlineInclude,
    collectFallbackDepsForInlined,
    collectFallbackDepsWithChain,
    mergeIncludes,
    prepareInlinedContent,
    rebaseRelativePaths,
    rebaseUrl,
    stripFirstHeading,
    stripHash,
} from './merge-includes';

describe('rebaseUrl', () => {
    it('should rebase a simple relative path', () => {
        expect(rebaseUrl('image.png', '_includes', '.')).toBe('_includes/image.png');
    });

    it('should rebase a relative path with subdirectory', () => {
        expect(rebaseUrl('./screenshot.png', 'docs/_includes', 'docs')).toBe(
            '_includes/screenshot.png',
        );
    });

    it('should rebase a parent-relative path', () => {
        expect(rebaseUrl('../images/photo.png', 'docs/_includes', 'docs')).toBe('images/photo.png');
    });

    it('should preserve hash fragment', () => {
        expect(rebaseUrl('other.md#section', '_includes', '.')).toBe('_includes/other.md#section');
    });

    it('should preserve search query', () => {
        expect(rebaseUrl('page.md?v=1', '_includes', '.')).toBe('_includes/page.md?v=1');
    });

    it('should preserve both hash and search', () => {
        expect(rebaseUrl('page.md?v=1#sec', '_includes', '.')).toBe('_includes/page.md?v=1#sec');
    });

    it('should return null for external URLs', () => {
        expect(rebaseUrl('https://example.com/page', '_includes', '.')).toBeNull();
        expect(rebaseUrl('http://example.com', '_includes', '.')).toBeNull();
    });

    it('should return null for absolute paths', () => {
        expect(rebaseUrl('/absolute/path.md', '_includes', '.')).toBeNull();
    });

    it('should return null for anchor-only URLs', () => {
        expect(rebaseUrl('#section', '_includes', '.')).toBeNull();
    });

    it('should return null for empty path with hash', () => {
        expect(rebaseUrl('#', '_includes', '.')).toBeNull();
    });

    it('should return null for term references starting with *', () => {
        expect(rebaseUrl('*update-window', '_includes', '.')).toBeNull();
        expect(rebaseUrl('*dynamic-resources', 'a/b', 'c/d')).toBeNull();
    });

    it('should return null for template directives starting with {', () => {
        expect(rebaseUrl('{%', '_includes', '.')).toBeNull();
        expect(rebaseUrl('{{var}}', '_includes', '.')).toBeNull();
    });

    it('should handle same directory (no rebase needed)', () => {
        expect(rebaseUrl('file.md', 'docs', 'docs')).toBe('file.md');
    });

    it('should handle deeply nested paths', () => {
        expect(rebaseUrl('../../root.md', 'a/b/c', '.')).toBe('a/root.md');
    });

    it('should return null for protocol-relative URLs', () => {
        expect(rebaseUrl('//cdn.example.com/file.js', '_includes', '.')).toBeNull();
    });

    it('should return null for mailto links', () => {
        expect(rebaseUrl('mailto:test@example.com', '_includes', '.')).toBeNull();
    });
});

describe('rebaseRelativePaths', () => {
    const from = '_includes/chapter.md' as NormalizedPath;
    const to = 'main.md' as NormalizedPath;

    it('should rebase inline links', () => {
        const content = 'See [docs](./guide.md) for details.';
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toBe('See [docs](_includes/guide.md) for details.');
    });

    it('should rebase inline images', () => {
        const content = '![screenshot](./images/screen.png)';
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toBe('![screenshot](_includes/images/screen.png)');
    });

    it('should rebase link definitions', () => {
        const content = '[ref]: ./guide.md "Guide"';
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toBe('[ref]: _includes/guide.md "Guide"');
    });

    it('should not rebase external URLs', () => {
        const content = '[link](https://example.com)';
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toBe('[link](https://example.com)');
    });

    it('should not rebase absolute paths', () => {
        const content = '[link](/absolute/path.md)';
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toBe('[link](/absolute/path.md)');
    });

    it('should not rebase anchor-only links', () => {
        const content = '[link](#section)';
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toBe('[link](#section)');
    });

    it('should preserve hash in rebased links', () => {
        const content = '[link](./guide.md#intro)';
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toBe('[link](_includes/guide.md#intro)');
    });

    it('should not modify content inside fenced code blocks (backticks)', () => {
        const content = [
            'Before code.',
            '```markdown',
            '[link](./should-not-rebase.md)',
            '```',
            'After code.',
        ].join('\n');
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toContain('[link](./should-not-rebase.md)');
        expect(result).toContain('Before code.');
        expect(result).toContain('After code.');
    });

    it('should not modify content inside fenced code blocks (tildes)', () => {
        const content = ['~~~', '[link](./should-not-rebase.md)', '~~~'].join('\n');
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toContain('[link](./should-not-rebase.md)');
    });

    it('should handle code blocks with language specifier', () => {
        const content = [
            '```typescript',
            'const url = "[link](./not-a-real-link.md)";',
            '```',
        ].join('\n');
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toContain('[link](./not-a-real-link.md)');
    });

    it('should handle multiple links on the same line', () => {
        const content = 'See [a](./a.md) and [b](./b.md).';
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toBe('See [a](_includes/a.md) and [b](_includes/b.md).');
    });

    it('should return content unchanged when source and target are in the same directory', () => {
        const sameDirFrom = 'docs/chapter.md' as NormalizedPath;
        const sameDirTo = 'docs/main.md' as NormalizedPath;
        const content = '[link](./guide.md)';
        const result = rebaseRelativePaths(content, sameDirFrom, sameDirTo);
        expect(result).toBe('[link](./guide.md)');
    });

    it('should handle empty content', () => {
        const result = rebaseRelativePaths('', from, to);
        expect(result).toBe('');
    });

    it('should handle content with no links', () => {
        const content = '# Title\n\nJust some text.';
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toBe('# Title\n\nJust some text.');
    });

    it('should handle links with title attributes', () => {
        const content = '[link](./guide.md "Guide Title")';
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toBe('[link](_includes/guide.md "Guide Title")');
    });

    it('should rebase correctly across multiple directory levels', () => {
        const deepFrom = 'a/b/c/deep.md' as NormalizedPath;
        const shallowTo = 'root.md' as NormalizedPath;
        const content = '[link](./local.md)';
        const result = rebaseRelativePaths(content, deepFrom, shallowTo);
        expect(result).toBe('[link](a/b/c/local.md)');
    });

    it('should handle indented link definitions', () => {
        const content = '  [ref]: ./guide.md';
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toBe('  [ref]: _includes/guide.md');
    });

    it('should handle code blocks after regular content', () => {
        const content = [
            '[before](./a.md)',
            '',
            '```',
            '[inside](./b.md)',
            '```',
            '',
            '[after](./c.md)',
        ].join('\n');
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toContain('[before](_includes/a.md)');
        expect(result).toContain('[inside](./b.md)');
        expect(result).toContain('[after](_includes/c.md)');
    });

    it('should rebase linked image outer URL', () => {
        const content = '[![img](../_assets/3.png)](../latex.md)';
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toBe('[![img](_assets/3.png)](latex.md)');
    });

    it('should rebase both parts of linked image from nested path', () => {
        const deepFrom = 'includes/deep.md' as NormalizedPath;
        const rootTo = 'root.md' as NormalizedPath;
        const content = '[![img 3](../_assets/3.png)](../latex.md)';
        const result = rebaseRelativePaths(content, deepFrom, rootTo);
        expect(result).toBe('[![img 3](_assets/3.png)](latex.md)');
    });

    it('should rebase linked image with attributes between ) and ]', () => {
        const deepFrom = '_includes/reusables/id-badges/mini.md' as NormalizedPath;
        const deepTo = 'station/meet/characteristics-mini.md' as NormalizedPath;
        const content =
            '[![Station Mini](../../../_assets/badges/kk/mini.png){height=25px}](../../../index.md)';
        const result = rebaseRelativePaths(content, deepFrom, deepTo);
        expect(result).toBe(
            '[![Station Mini](../../_assets/badges/kk/mini.png){height=25px}](../../index.md)',
        );
    });

    it('should not rebase term references and should preserve include directives in link defs', () => {
        const deepFrom = '_includes/update-window.md' as NormalizedPath;
        const deepTo = 'how-to/dynresources.md' as NormalizedPath;
        const content = [
            '[Окно обновления](*update-window) — текст.',
            '',
            '[*update-window]: {% include [update-window](../_includes/glossary/update-window.md) %}',
        ].join('\n');
        const result = rebaseRelativePaths(content, deepFrom, deepTo);
        expect(result).toBe(
            [
                '[Окно обновления](*update-window) — текст.',
                '',
                '[*update-window]: {% include [update-window](../_includes/glossary/update-window.md) %}',
            ].join('\n'),
        );
    });

    it('should not double-rebase links with parentheses in text', () => {
        const deepFrom = 'en/_roles/src/repositories/developer.md' as NormalizedPath;
        const deepTo = 'en/sourcecraft/security/index.md' as NormalizedPath;
        const content =
            '* [continuous integration (CI)](../../../sourcecraft/concepts/ci-cd.md#ci) checks';
        const result = rebaseRelativePaths(content, deepFrom, deepTo);
        expect(result).toBe('* [continuous integration (CI)](../concepts/ci-cd.md#ci) checks');
    });

    it('should not treat inline backtick fences as code blocks', () => {
        const content = [
            '```FROM [...] WHERE (id1="a") OR (id2="b")```',
            '[link](./after-inline-fence.md)',
        ].join('\n');
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toContain('[link](_includes/after-inline-fence.md)');
    });

    it('should close code fence followed by table cell separator ||', () => {
        const content = [
            '```json',
            '{"key": "value"}',
            '```||',
            '||[link](./after-fence-table.md)||',
        ].join('\n');
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toContain('[link](_includes/after-fence-table.md)');
    });

    it('should rebase links with leading space after opening paren', () => {
        const content = '[Schemas]( ../api/python/userdoc.md#table_schema)';
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toBe('[Schemas]( api/python/userdoc.md#table_schema)');
    });

    it('should rebase double-bracket autotitle links [[!TITLE path]](url)', () => {
        const deepFrom = '_includes/deep/nested.md' as NormalizedPath;
        const deepTo = 'concepts/index.md' as NormalizedPath;
        const content = '[[!TITLE ../concepts/stages.md#step]](../../concepts/stages.md#step)';
        const result = rebaseRelativePaths(content, deepFrom, deepTo);
        expect(result).toBe('[[!TITLE ../concepts/stages.md#step]](stages.md#step)');
    });

    it('should rebase links with nested brackets in text: [tasks[]](url)', () => {
        const content = '[tasks[]](../../../reference/tasks/get-tasks-id.md#response)';
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toBe('[tasks[]](../../reference/tasks/get-tasks-id.md#response)');
    });

    it('should rebase links with bracketed text: [[label] rest](url)', () => {
        const content = '[[Промохак] Загрузить ассортимент](../content/PROMOGUIDE-60.md)';
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toBe('[[Промохак] Загрузить ассортимент](content/PROMOGUIDE-60.md)');
    });

    it('should rebase both inner and outer URLs in nested links', () => {
        const deepFrom =
            'en/_includes/data-transfer/troubles/postgresql/conn-duration-quota.md' as NormalizedPath;
        const deepTo = 'en/data-transfer/troubleshooting/index.md' as NormalizedPath;
        const content =
            '[change the [Session duration timeout](../../../../managed-postgresql/concepts/settings-list.md#setting) setting](../../../../managed-postgresql/operations/update.md#config)';
        const result = rebaseRelativePaths(content, deepFrom, deepTo);
        expect(result).toBe(
            '[change the [Session duration timeout](../../managed-postgresql/concepts/settings-list.md#setting) setting](../../managed-postgresql/operations/update.md#config)',
        );
    });

    it('should not hang on lines with unmatched brackets in code spans', () => {
        const content =
            '2. **Literals**: Literals allow escaping of the `\\\\<escape-sequence>` form where `<escape-sequence>` can be one of the characters: `\\\\`, `/`, `@`, `&`, `*`, `[`, or `{`. Literals also allow an expression of the `x<hex1><hex2>` form where `<hex1>` and `<hex2>` are hexadecimal digits.';
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toBe(content);
    });

    it('should handle 4+ backtick fences correctly', () => {
        const content = [
            '````',
            '```',
            '[link](./inside-nested.md)',
            '```',
            '````',
            '[link](./outside.md)',
        ].join('\n');
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toContain('[link](./inside-nested.md)');
        expect(result).toContain('[link](_includes/outside.md)');
    });
});

function makeDep(overrides: Partial<HashedGraphNode> = {}): HashedGraphNode {
    return {
        path: '_includes/simple.md' as NormalizedPath,
        link: '_includes/simple.md',
        match: '{% include [label](_includes/simple.md) %}',
        location: [0, 42],
        hash: null,
        search: null,
        content: '# Heading\n\nSome content.',
        deps: [],
        ...overrides,
    } as HashedGraphNode;
}

describe('canInlineInclude', () => {
    it('should allow simple include at column 0', () => {
        const content = '{% include [label](_includes/simple.md) %}';
        const dep = makeDep({location: [0, content.length]});
        expect(canInlineInclude(dep, content)).toBe(true);
    });

    it('should reject include with indent', () => {
        const content = '  {% include [label](_includes/simple.md) %}';
        const dep = makeDep({location: [2, content.length], match: content.slice(2)});
        expect(canInlineInclude(dep, content)).toBe(false);
    });

    it('should reject include with indent after newline', () => {
        const content = 'Line 1\n   {% include [label](_includes/simple.md) %}';
        const dep = makeDep({location: [10, content.length], match: content.slice(10)});
        expect(canInlineInclude(dep, content)).toBe(false);
    });

    it('should reject include with hash fragment in link', () => {
        const content = '{% include [label](_includes/file.md#section) %}';
        const dep = makeDep({
            location: [0, content.length],
            link: '_includes/file.md#section',
        });
        expect(canInlineInclude(dep, content)).toBe(false);
    });

    it('should reject include when content has term definitions', () => {
        const content = '{% include [label](_includes/terms.md) %}';
        const dep = makeDep({
            location: [0, content.length],
            content: '# Terms\n\n[*term]: Definition of term',
        });
        expect(canInlineInclude(dep, content)).toBe(false);
    });

    it('should allow include with notitle modifier', () => {
        const content = '{% include notitle [label](_includes/simple.md) %}';
        const dep = makeDep({
            location: [0, content.length],
            match: content,
        });
        expect(canInlineInclude(dep, content)).toBe(true);
    });
});

describe('stripFirstHeading', () => {
    it('should strip first ATX heading', () => {
        const content = '# Heading\n\nBody text.';
        expect(stripFirstHeading(content)).toBe('Body text.');
    });

    it('should strip heading and trailing empty line', () => {
        const content = '## Sub Heading\n\nBody.';
        expect(stripFirstHeading(content)).toBe('Body.');
    });

    it('should strip heading with anchor', () => {
        const content = '# Heading {#my-anchor}\n\nBody.';
        expect(stripFirstHeading(content)).toBe('Body.');
    });

    it('should skip leading empty lines and strip first heading', () => {
        const content = '\n\n# Heading\n\nBody.';
        expect(stripFirstHeading(content)).toBe('\n\nBody.');
    });

    it('should not strip if first non-empty line is not a heading', () => {
        const content = 'Not a heading\n\n# Heading\n\nBody.';
        expect(stripFirstHeading(content)).toBe('Not a heading\n\n# Heading\n\nBody.');
    });

    it('should handle content with only a heading', () => {
        const content = '# Only Heading';
        expect(stripFirstHeading(content)).toBe('');
    });

    it('should handle h6 heading', () => {
        const content = '###### Deep Heading\n\nBody.';
        expect(stripFirstHeading(content)).toBe('Body.');
    });

    it('should handle empty content', () => {
        expect(stripFirstHeading('')).toBe('');
    });
});

describe('stripHash', () => {
    it('should strip hash fragment from path', () => {
        expect(stripHash('file.md#section')).toBe('file.md');
    });

    it('should return path unchanged when no hash', () => {
        expect(stripHash('file.md')).toBe('file.md');
    });

    it('should handle hash at the end', () => {
        expect(stripHash('file.md#')).toBe('file.md');
    });

    it('should strip only the first hash', () => {
        expect(stripHash('file.md#a#b')).toBe('file.md');
    });
});

describe('collectFallbackDepsForInlined', () => {
    it('should collect rebased entries from flat deps list', () => {
        const deps: HashedGraphNode[] = [
            makeDep({
                path: '_includes/inner.md' as NormalizedPath,
                link: 'inner.md',
                content: 'Inner content.',
            }),
        ];
        const seen = new Set<string>();
        const result = collectFallbackDepsForInlined(
            deps,
            '_includes/outer.md' as NormalizedPath,
            'main.md' as NormalizedPath,
            seen,
        );
        expect(result).toHaveLength(1);
        expect(result[0].key).toBe('_includes/inner.md');
        expect(result[0].content).toBe('Inner content.');
    });

    it('should skip duplicate keys via seen set', () => {
        const deps: HashedGraphNode[] = [
            makeDep({
                path: '_includes/a.md' as NormalizedPath,
                link: 'a.md',
                content: 'Content A.',
            }),
            makeDep({
                path: '_includes/a.md' as NormalizedPath,
                link: 'a.md',
                content: 'Content A duplicate.',
            }),
        ];
        const seen = new Set<string>();
        const result = collectFallbackDepsForInlined(
            deps,
            '_includes/parent.md' as NormalizedPath,
            'root.md' as NormalizedPath,
            seen,
        );
        expect(result).toHaveLength(1);
        expect(result[0].content).toBe('Content A.');
    });

    it('should recursively collect nested deps', () => {
        const inner = makeDep({
            path: '_includes/deep/inner.md' as NormalizedPath,
            link: 'inner.md',
            content: 'Deep content.',
        });
        const deps: HashedGraphNode[] = [
            makeDep({
                path: '_includes/deep/outer.md' as NormalizedPath,
                link: 'deep/outer.md',
                content: 'Outer content.',
                deps: [inner],
            }),
        ];
        const seen = new Set<string>();
        const result = collectFallbackDepsForInlined(
            deps,
            '_includes/base.md' as NormalizedPath,
            'root.md' as NormalizedPath,
            seen,
        );
        expect(result).toHaveLength(2);
    });

    it('should strip hash from link when rebasing', () => {
        const deps: HashedGraphNode[] = [
            makeDep({
                path: '_includes/file.md' as NormalizedPath,
                link: 'file.md#section',
                content: 'Hashed content.',
            }),
        ];
        const seen = new Set<string>();
        const result = collectFallbackDepsForInlined(
            deps,
            '_includes/parent.md' as NormalizedPath,
            'root.md' as NormalizedPath,
            seen,
        );
        expect(result).toHaveLength(1);
        expect(result[0].key).toBe('_includes/file.md');
    });

    it('should strip frontmatter from content', () => {
        const deps: HashedGraphNode[] = [
            makeDep({
                path: '_includes/fm.md' as NormalizedPath,
                link: 'fm.md',
                content: '---\ntitle: Test\n---\nBody.',
            }),
        ];
        const seen = new Set<string>();
        const result = collectFallbackDepsForInlined(
            deps,
            '_includes/parent.md' as NormalizedPath,
            'root.md' as NormalizedPath,
            seen,
        );
        expect(result[0].content).toBe('Body.');
    });
});

describe('collectFallbackDepsWithChain', () => {
    it('should collect entries with colon-chain keys', () => {
        const deps: HashedGraphNode[] = [makeDep({link: 'inner.md', content: 'Inner.'})];
        const seen = new Set<string>();
        const result = collectFallbackDepsWithChain(deps, '_includes/outer.md', seen);
        expect(result).toHaveLength(1);
        expect(result[0].key).toBe('_includes/outer.md:inner.md');
        expect(result[0].content).toBe('Inner.');
    });

    it('should use link as key when parentKey is empty', () => {
        const deps: HashedGraphNode[] = [makeDep({link: 'file.md', content: 'Content.'})];
        const seen = new Set<string>();
        const result = collectFallbackDepsWithChain(deps, '', seen);
        expect(result).toHaveLength(1);
        expect(result[0].key).toBe('file.md');
    });

    it('should skip duplicates via seen set', () => {
        const deps: HashedGraphNode[] = [
            makeDep({link: 'a.md', content: 'A.'}),
            makeDep({link: 'a.md', content: 'A duplicate.'}),
        ];
        const seen = new Set<string>();
        const result = collectFallbackDepsWithChain(deps, 'parent.md', seen);
        expect(result).toHaveLength(1);
    });

    it('should recursively collect nested deps with chained keys', () => {
        const inner = makeDep({link: 'deep.md', content: 'Deep.'});
        const deps: HashedGraphNode[] = [makeDep({link: 'mid.md', content: 'Mid.', deps: [inner]})];
        const seen = new Set<string>();
        const result = collectFallbackDepsWithChain(deps, 'outer.md', seen);
        expect(result).toHaveLength(2);
        expect(result[0].key).toBe('outer.md:mid.md');
        expect(result[1].key).toBe('outer.md:mid.md:deep.md');
    });

    it('should strip hash from link in key', () => {
        const deps: HashedGraphNode[] = [makeDep({link: 'file.md#section', content: 'Sec.'})];
        const seen = new Set<string>();
        const result = collectFallbackDepsWithChain(deps, 'parent.md', seen);
        expect(result[0].key).toBe('parent.md:file.md');
    });
});

describe('prepareInlinedContent', () => {
    it('should strip frontmatter and rebase paths', () => {
        const dep = makeDep({
            path: '_includes/chapter.md' as NormalizedPath,
            content: '---\ntitle: Chapter\n---\n[link](./local.md)',
            match: '{% include [ch](_includes/chapter.md) %}',
        });
        const result = prepareInlinedContent(dep, 'main.md' as NormalizedPath);
        expect(result).toBe('[link](_includes/local.md)');
    });

    it('should strip first heading when notitle', () => {
        const dep = makeDep({
            path: '_includes/chapter.md' as NormalizedPath,
            content: '# Chapter Title\n\nBody text.',
            match: '{% include notitle [ch](_includes/chapter.md) %}',
        });
        const result = prepareInlinedContent(dep, 'main.md' as NormalizedPath);
        expect(result).toBe('Body text.');
    });

    it('should not strip heading without notitle', () => {
        const dep = makeDep({
            path: '_includes/chapter.md' as NormalizedPath,
            content: '# Chapter Title\n\nBody.',
            match: '{% include [ch](_includes/chapter.md) %}',
        });
        const result = prepareInlinedContent(dep, 'main.md' as NormalizedPath);
        expect(result).toBe('# Chapter Title\n\nBody.');
    });

    it('should not rebase when same directory', () => {
        const dep = makeDep({
            path: 'docs/chapter.md' as NormalizedPath,
            content: '[link](./local.md)',
            match: '{% include [ch](docs/chapter.md) %}',
        });
        const result = prepareInlinedContent(dep, 'docs/main.md' as NormalizedPath);
        expect(result).toBe('[link](./local.md)');
    });
});

describe('addFallbackDep', () => {
    it('should add entry when not seen', () => {
        const dep = makeDep({link: 'file.md', content: 'Content.'});
        const seen = new Set<string>();
        const entries: {key: string; content: string}[] = [];
        addFallbackDep(dep, seen, entries);
        expect(entries).toHaveLength(1);
        expect(entries[0].key).toBe('file.md');
        expect(entries[0].content).toBe('Content.');
        expect(seen.has('file.md')).toBe(true);
    });

    it('should not add entry when already seen', () => {
        const dep = makeDep({link: 'file.md', content: 'Content.'});
        const seen = new Set<string>(['file.md']);
        const entries: {key: string; content: string}[] = [];
        addFallbackDep(dep, seen, entries);
        expect(entries).toHaveLength(0);
    });

    it('should strip hash from key', () => {
        const dep = makeDep({link: 'file.md#section', content: 'Content.'});
        const seen = new Set<string>();
        const entries: {key: string; content: string}[] = [];
        addFallbackDep(dep, seen, entries);
        expect(entries[0].key).toBe('file.md');
    });

    it('should collect nested deps with colon-chain', () => {
        const inner = makeDep({link: 'inner.md', content: 'Inner.'});
        const dep = makeDep({link: 'outer.md', content: 'Outer.', deps: [inner]});
        const seen = new Set<string>();
        const entries: {key: string; content: string}[] = [];
        addFallbackDep(dep, seen, entries);
        expect(entries).toHaveLength(2);
        expect(entries[0].key).toBe('outer.md');
        expect(entries[1].key).toBe('outer.md:inner.md');
    });

    it('should strip frontmatter from content', () => {
        const dep = makeDep({
            link: 'file.md',
            content: '---\ntitle: FM\n---\nBody.',
        });
        const seen = new Set<string>();
        const entries: {key: string; content: string}[] = [];
        addFallbackDep(dep, seen, entries);
        expect(entries[0].content).toBe('Body.');
    });
});

describe('mergeIncludes', () => {
    const mockRun = {} as Parameters<typeof mergeIncludes>[0];

    async function runMerge(
        deps: HashedGraphNode[],
        parentContent: string,
        entry: NormalizedPath,
    ): Promise<string> {
        const step = mergeIncludes(mockRun, deps, parentContent);
        const scheduler = new Scheduler([step]);
        await scheduler.schedule(entry);
        return scheduler.process(parentContent);
    }

    it('should return content unchanged when no deps', async () => {
        const content = '# Hello World';
        const result = await runMerge([], content, 'main.md' as NormalizedPath);
        expect(result).toBe(content);
    });

    it('should inline a simple include', async () => {
        const parentContent = '{% include [label](_includes/simple.md) %}';
        const dep = makeDep({
            path: '_includes/simple.md' as NormalizedPath,
            link: '_includes/simple.md',
            match: parentContent,
            location: [0, parentContent.length],
            content: 'Inlined text.',
            deps: [],
        });
        const result = await runMerge([dep], parentContent, 'main.md' as NormalizedPath);
        expect(result).toBe('Inlined text.');
    });

    it('should produce fallback block for include with hash', async () => {
        const parentContent = '{% include [label](_includes/file.md#section) %}';
        const dep = makeDep({
            path: '_includes/file.md' as NormalizedPath,
            link: '_includes/file.md#section',
            match: parentContent,
            location: [0, parentContent.length],
            content: '# Section\n\nContent.',
            deps: [],
        });
        const result = await runMerge([dep], parentContent, 'main.md' as NormalizedPath);
        expect(result).toContain(parentContent);
        expect(result).toContain('{% included (_includes/file.md) %}');
        expect(result).toContain('{% endincluded %}');
    });

    it('should produce fallback block for indented include', async () => {
        const parentContent = 'Text before\n  {% include [label](_includes/indented.md) %}';
        const dep = makeDep({
            path: '_includes/indented.md' as NormalizedPath,
            link: '_includes/indented.md',
            match: '{% include [label](_includes/indented.md) %}',
            location: [14, parentContent.length],
            content: 'Fallback content.',
            deps: [],
        });
        const result = await runMerge([dep], parentContent, 'main.md' as NormalizedPath);
        expect(result).toContain(parentContent);
        expect(result).toContain('{% included (_includes/indented.md) %}');
    });

    it('should inline with notitle stripping heading', async () => {
        const parentContent = '{% include notitle [ch](_includes/chapter.md) %}';
        const dep = makeDep({
            path: '_includes/chapter.md' as NormalizedPath,
            link: '_includes/chapter.md',
            match: parentContent,
            location: [0, parentContent.length],
            content: '# Chapter Title\n\nBody text.',
            deps: [],
        });
        const result = await runMerge([dep], parentContent, 'main.md' as NormalizedPath);
        expect(result).toBe('Body text.');
    });

    it('should rebase links in inlined content', async () => {
        const parentContent = '{% include [ch](_includes/chapter.md) %}';
        const dep = makeDep({
            path: '_includes/chapter.md' as NormalizedPath,
            link: '_includes/chapter.md',
            match: parentContent,
            location: [0, parentContent.length],
            content: '[link](./local.md)',
            deps: [],
        });
        const result = await runMerge([dep], parentContent, 'main.md' as NormalizedPath);
        expect(result).toBe('[link](_includes/local.md)');
    });

    it('should collect sub-deps of inlined include as fallback entries', async () => {
        const parentContent = '{% include [ch](_includes/outer.md) %}';
        const inner = makeDep({
            path: '_includes/inner.md' as NormalizedPath,
            link: 'inner.md',
            content: 'Inner content.',
            deps: [],
        });
        const dep = makeDep({
            path: '_includes/outer.md' as NormalizedPath,
            link: '_includes/outer.md',
            match: parentContent,
            location: [0, parentContent.length],
            content: 'Outer with {% include [i](inner.md) %}.',
            deps: [inner],
        });
        const result = await runMerge([dep], parentContent, 'main.md' as NormalizedPath);
        expect(result).toContain('Outer with {% include [i](_includes/inner.md) %}.');
        expect(result).toContain('{% included (_includes/inner.md) %}');
        expect(result).toContain('Inner content.');
    });

    it('should handle mix of inlined and fallback deps', async () => {
        const inlinePart = '{% include [a](_includes/a.md) %}';
        const fallbackPart = '{% include [b](_includes/b.md#sec) %}';
        const parentContent = `${inlinePart}\n${fallbackPart}`;

        const depA = makeDep({
            path: '_includes/a.md' as NormalizedPath,
            link: '_includes/a.md',
            match: inlinePart,
            location: [0, inlinePart.length],
            content: 'Content A.',
            deps: [],
        });
        const depB = makeDep({
            path: '_includes/b.md' as NormalizedPath,
            link: '_includes/b.md#sec',
            match: fallbackPart,
            location: [inlinePart.length + 1, parentContent.length],
            content: '# Section\n\nContent B.',
            deps: [],
        });
        const result = await runMerge([depA, depB], parentContent, 'main.md' as NormalizedPath);
        expect(result).toContain('Content A.');
        expect(result).toContain(fallbackPart);
        expect(result).toContain('{% included (_includes/b.md) %}');
    });

    it('should collect nested deps of fallback include with colon-chain', async () => {
        const parentContent = '{% include [a](_includes/a.md#sec) %}';
        const inner = makeDep({
            path: '_includes/inner.md' as NormalizedPath,
            link: 'inner.md',
            content: 'Inner.',
            deps: [],
        });
        const dep = makeDep({
            path: '_includes/a.md' as NormalizedPath,
            link: '_includes/a.md#sec',
            match: parentContent,
            location: [0, parentContent.length],
            content: 'Parent content with include.',
            deps: [inner],
        });
        const result = await runMerge([dep], parentContent, 'main.md' as NormalizedPath);
        expect(result).toContain('{% included (_includes/a.md) %}');
        expect(result).toContain('{% included (_includes/a.md:inner.md) %}');
    });
});
