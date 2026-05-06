import type {HashedGraphNode} from '../utils';

import {describe, expect, it} from 'vitest';

import {Scheduler} from '../utils';

import {
    addFallbackDep,
    addIndent,
    canInlineInclude,
    collectFallbackDepsForInlined,
    collectFallbackDepsWithChain,
    extractSection,
    extractTermDefinitions,
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

    it('should not rebase bracket-paren patterns inside inline code spans', () => {
        const content =
            '`YPath<Type>[Strict](yson, ypath)`: Extracts a value at `ypath` from `yson`.';
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toBe(content);
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

    it('should allow include with indent (Step 2)', () => {
        const content = '  {% include [label](_includes/simple.md) %}';
        const dep = makeDep({location: [2, content.length], match: content.slice(2)});
        expect(canInlineInclude(dep, content)).toBe(true);
    });

    it('should allow include with indent after newline (Step 2)', () => {
        const content = 'Line 1\n   {% include [label](_includes/simple.md) %}';
        const dep = makeDep({location: [10, content.length], match: content.slice(10)});
        expect(canInlineInclude(dep, content)).toBe(true);
    });

    it('should allow include with hash fragment in link (Step 3)', () => {
        const content = '{% include [label](_includes/file.md#section) %}';
        const dep = makeDep({
            location: [0, content.length],
            link: '_includes/file.md#section',
        });
        expect(canInlineInclude(dep, content)).toBe(true);
    });

    it('should allow include with term definitions in dep content (Step 4)', () => {
        const content = '{% include [label](_includes/terms.md) %}';
        const dep = makeDep({
            location: [0, content.length],
            content: '# Terms\n\n[*term]: Definition of term',
        });
        expect(canInlineInclude(dep, content)).toBe(true);
    });

    it('should allow include with term definitions with hyphens in dep content (Step 4)', () => {
        const content = '{% include [label](_includes/terms.md) %}';
        const dep = makeDep({
            location: [0, content.length],
            content: '# Terms\n\n[*ekat-mgt]: Some definition',
        });
        expect(canInlineInclude(dep, content)).toBe(true);
    });

    it('should allow include with notitle modifier', () => {
        const content = '{% include notitle [label](_includes/simple.md) %}';
        const dep = makeDep({
            location: [0, content.length],
            match: content,
        });
        expect(canInlineInclude(dep, content)).toBe(true);
    });

    it('should reject include inside a term definition', () => {
        const includeDirective = '{% include notitle [desc](_includes/v.1.md#placeID) %}';
        const content = `[*placeID]: ${includeDirective}`;
        const dep = makeDep({
            location: [13, content.length],
            match: includeDirective,
            link: '_includes/v.1.md#placeID',
        });
        expect(canInlineInclude(dep, content)).toBe(false);
    });

    it('should reject include inside a term definition after newline', () => {
        const includeDirective = '{% include notitle [desc](_includes/v.1.md#sync) %}';
        const content = `# Title\n\n[*syncFactor]: ${includeDirective}`;
        const dep = makeDep({
            location: [content.indexOf('{%'), content.length],
            match: includeDirective,
            link: '_includes/v.1.md#sync',
        });
        expect(canInlineInclude(dep, content)).toBe(false);
    });

    it('should reject include with text after it on the same line', () => {
        const includeDirective = '{% include [label](_includes/simple.md) %}';
        const content = `${includeDirective} some trailing text`;
        const dep = makeDep({
            location: [0, includeDirective.length],
            match: includeDirective,
        });
        expect(canInlineInclude(dep, content)).toBe(false);
    });

    it('should reject include inline within a sentence', () => {
        const includeDirective = '{% include [label](_includes/simple.md) %}';
        const content = `See ${includeDirective} for details.`;
        const dep = makeDep({
            location: [4, 4 + includeDirective.length],
            match: includeDirective,
        });
        expect(canInlineInclude(dep, content)).toBe(false);
    });

    it('should reject standalone include that appears after first term definition', () => {
        const includeDirective = '{% include notitle [note](_includes/notes.md#banner) %}';
        const content = [
            '[*placeID]: {% include notitle [desc](_includes/v.1.md#placeID) %}',
            '    ',
            includeDirective,
        ].join('\n');
        const startPos = content.indexOf(includeDirective);
        const dep = makeDep({
            location: [startPos, startPos + includeDirective.length],
            match: includeDirective,
            link: '_includes/notes.md#banner',
        });
        expect(canInlineInclude(dep, content)).toBe(false);
    });

    it('should reject standalone include after term definition with hyphens in name', () => {
        const includeDirective = '{% include [desc](_includes/storages/ekat-mgt.md) %}';
        const content = [
            '[*ekat-mgt]:',
            '   {% include [ekat-mgt](_includes/storages/ekat-mgt.md) %}',
            '',
            includeDirective,
        ].join('\n');
        const startPos = content.indexOf(includeDirective);
        const dep = makeDep({
            location: [startPos, startPos + includeDirective.length],
            match: includeDirective,
        });
        expect(canInlineInclude(dep, content)).toBe(false);
    });

    it('should allow standalone include that appears before first term definition', () => {
        const includeDirective = '{% include [ch](_includes/chapter.md) %}';
        const content = [includeDirective, '', '[*term]: Definition here'].join('\n');
        const dep = makeDep({
            location: [0, includeDirective.length],
            match: includeDirective,
        });
        expect(canInlineInclude(dep, content)).toBe(true);
    });

    it('should not inline GFM bold+pipe table dep when include is inside term section (checkTermBoundary false)', () => {
        const includeDirective = '{% include [ph](_includes/ph.md) %}';
        const content = `Intro\n\n[*ph]: ${includeDirective}\n\n[*z]: Other`;
        const dep = makeDep({
            path: '_includes/ph.md' as NormalizedPath,
            link: '_includes/ph.md',
            match: includeDirective,
            location: [
                content.indexOf(includeDirective),
                content.indexOf(includeDirective) + includeDirective.length,
            ],
            content: '**A** | **B**\n----- | -----\n1 | 2\n',
        });
        expect(canInlineInclude(dep, content, false)).toBe(false);
    });

    it('should inline same GFM table dep when include is before any term (checkTermBoundary false)', () => {
        const includeDirective = '{% include [ph](_includes/ph.md) %}';
        const content = `${includeDirective}\n\n[*z]: Other`;
        const dep = makeDep({
            path: '_includes/ph.md' as NormalizedPath,
            link: '_includes/ph.md',
            match: includeDirective,
            location: [0, includeDirective.length],
            content: '**A** | **B**\n----- | -----\n1 | 2\n',
        });
        expect(canInlineInclude(dep, content, false)).toBe(true);
    });

    it('should not inline bold-leading list dep inside term section', () => {
        const includeDirective = '{% include [r](_includes/r.md) %}';
        const content = `[*t]: ${includeDirective}\n\n[*z]: Z`;
        const dep = makeDep({
            path: '_includes/r.md' as NormalizedPath,
            link: '_includes/r.md',
            match: includeDirective,
            location: [
                content.indexOf(includeDirective),
                content.indexOf(includeDirective) + includeDirective.length,
            ],
            content: '- **A** — one\n- **B** — two\n',
        });
        expect(canInlineInclude(dep, content, false)).toBe(false);
    });

    it('should not inline only-include dep on separate line from term label', () => {
        const includeDirective = '{% include [x](_includes/x.md) %}';
        const content = `[*wrap]:\n    ${includeDirective}\n\n[*z]: Z`;
        const dep = makeDep({
            path: '_includes/x.md' as NormalizedPath,
            link: '_includes/x.md',
            match: includeDirective,
            location: [
                content.indexOf(includeDirective),
                content.indexOf(includeDirective) + includeDirective.length,
            ],
            content: '  \n{% include [i](inner.md) %}\n',
        });
        expect(canInlineInclude(dep, content, false)).toBe(false);
    });

    it('should inline only-include dep on same line as term label', () => {
        const includeDirective = '{% include [x](_includes/x.md) %}';
        const content = `[*wrap]: ${includeDirective}\n\n[*z]: Z`;
        const dep = makeDep({
            path: '_includes/x.md' as NormalizedPath,
            link: '_includes/x.md',
            match: includeDirective,
            location: [
                content.indexOf(includeDirective),
                content.indexOf(includeDirective) + includeDirective.length,
            ],
            content: '{% include [i](inner.md) %}',
        });
        expect(canInlineInclude(dep, content, false)).toBe(true);
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

    it('should keep the heading when stripping would leave only whitespace', () => {
        const content = '# Only Heading';
        expect(stripFirstHeading(content)).toBe('# Only Heading');
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

describe('extractTermDefinitions', () => {
    it('should return unchanged content when no terms', () => {
        const content = '# Title\n\nBody text.';
        const result = extractTermDefinitions(content);
        expect(result.cleanContent).toBe(content);
        expect(result.terms).toEqual([]);
    });

    it('should extract single term definition', () => {
        const content = '# Title\n\nBody.\n\n[*api]: Application Programming Interface';
        const result = extractTermDefinitions(content);
        expect(result.cleanContent).toBe('# Title\n\nBody.');
        expect(result.terms).toHaveLength(1);
        expect(result.terms[0].key).toBe('api');
        expect(result.terms[0].block).toBe('[*api]: Application Programming Interface');
    });

    it('should extract multiple term definitions', () => {
        const content = 'Content.\n\n[*api]: API def\n\n[*sdk]: SDK def';
        const result = extractTermDefinitions(content);
        expect(result.cleanContent).toBe('Content.');
        expect(result.terms).toHaveLength(2);
        expect(result.terms[0].key).toBe('api');
        expect(result.terms[1].key).toBe('sdk');
    });

    it('should handle multiline term definition', () => {
        const content = 'Content.\n\n[*api]: First line\nSecond line\n\n[*sdk]: SDK';
        const result = extractTermDefinitions(content);
        expect(result.terms[0].block).toBe('[*api]: First line\nSecond line');
        expect(result.terms[1].block).toBe('[*sdk]: SDK');
    });

    it('should handle term definition with include directive', () => {
        const content =
            'Content.\n\n[*term]: {% include notitle [desc](_includes/v.1.md#placeID) %}';
        const result = extractTermDefinitions(content);
        expect(result.cleanContent).toBe('Content.');
        expect(result.terms[0].block).toBe(
            '[*term]: {% include notitle [desc](_includes/v.1.md#placeID) %}',
        );
    });

    it('should not treat term-like syntax inside code blocks as terms', () => {
        const content = 'Content.\n\n```\n[*fake]: Not a real term\n```\n\n[*real]: Real term';
        const result = extractTermDefinitions(content);
        expect(result.terms).toHaveLength(1);
        expect(result.terms[0].key).toBe('real');
    });

    it('should handle term with hyphens and special characters', () => {
        const content = 'Body.\n\n[*ekat-mgt]: Центр обработки данных';
        const result = extractTermDefinitions(content);
        expect(result.terms[0].key).toBe('ekat-mgt');
    });

    it('should trim trailing blank lines from clean content', () => {
        const content = 'Body.\n\n\n\n[*term]: Definition';
        const result = extractTermDefinitions(content);
        expect(result.cleanContent).toBe('Body.');
    });

    it('should handle content that is only term definitions', () => {
        const content = '[*api]: API\n\n[*sdk]: SDK';
        const result = extractTermDefinitions(content);
        expect(result.cleanContent).toBe('');
        expect(result.terms).toHaveLength(2);
    });

    it('should extract term definitions indented inside a list (multiline merge)', () => {
        const content = ['1. Step one', '', '   [*api]: Indented definition line'].join('\n');
        const result = extractTermDefinitions(content);
        expect(result.cleanContent).toBe('1. Step one');
        expect(result.terms).toHaveLength(1);
        expect(result.terms[0].key).toBe('api');
        expect(result.terms[0].block).toBe('   [*api]: Indented definition line');
    });
});

describe('addIndent', () => {
    it('should return content unchanged when no indent', () => {
        expect(addIndent('Line 1\nLine 2', '')).toBe('Line 1\nLine 2');
    });

    it('should not indent first line', () => {
        expect(addIndent('Line 1\nLine 2\nLine 3', '  ')).toBe('Line 1\n  Line 2\n  Line 3');
    });

    it('should not indent empty lines', () => {
        expect(addIndent('Line 1\n\nLine 3', '  ')).toBe('Line 1\n\n  Line 3');
    });

    it('should handle single line content', () => {
        expect(addIndent('Only line', '   ')).toBe('Only line');
    });

    it('should handle tab indent', () => {
        expect(addIndent('A\nB', '\t')).toBe('A\n\tB');
    });

    it('should preserve blockquote/table prefix on continuation lines', () => {
        expect(addIndent('<!-- a -->\nLine\n', '> |  ')).toBe('<!-- a -->\n> |  Line\n');
    });

    it('should preserve CRLF line endings (Windows)', () => {
        expect(addIndent('Line 1\r\nLine 2\r\nLine 3', '  ')).toBe(
            'Line 1\r\n  Line 2\r\n  Line 3',
        );
    });

    it('should preserve CR line endings (old Mac)', () => {
        expect(addIndent('Line 1\rLine 2\rLine 3', '  ')).toBe('Line 1\r  Line 2\r  Line 3');
    });

    it('should not indent empty lines with CRLF', () => {
        expect(addIndent('Line 1\r\n\r\nLine 3', '  ')).toBe('Line 1\r\n\r\n  Line 3');
    });
});

describe('extractSection', () => {
    it('should extract section by explicit anchor', () => {
        const content = '# Other\n\nIgnored.\n\n## Target {#my-section}\n\nContent.\n\n## Next';
        expect(extractSection(content, 'my-section')).toBe('## Target {#my-section}\n\nContent.');
    });

    it('should extract section by auto-generated slug', () => {
        const content = '# First\n\nSkip.\n\n## Getting Started\n\nTarget.';
        expect(extractSection(content, 'getting-started')).toBe('## Getting Started\n\nTarget.');
    });

    it('should extract section until heading of same level', () => {
        const content = '## A\n\nContent A.\n\n## B\n\nContent B.';
        expect(extractSection(content, 'a')).toBe('## A\n\nContent A.');
    });

    it('should not end a section at a shallower heading (same as findBlockTokens)', () => {
        const content = '### Deep\n\nContent.\n\n## Shallow\n\nAfter.';
        expect(extractSection(content, 'deep')).toBe(
            '### Deep\n\nContent.\n\n## Shallow\n\nAfter.',
        );
    });

    it('should extract section to EOF if no following heading', () => {
        const content = '# Intro\n\n## Only Section\n\nAll content here.';
        expect(extractSection(content, 'only-section')).toBe(
            '## Only Section\n\nAll content here.',
        );
    });

    it('should include sub-headings in the section', () => {
        const content = '## Main\n\nText.\n\n### Sub\n\nSub text.\n\n## Next';
        expect(extractSection(content, 'main')).toBe('## Main\n\nText.\n\n### Sub\n\nSub text.');
    });

    it('should return full content if hash not found', () => {
        const content = '# Title\n\nBody.';
        expect(extractSection(content, 'nonexistent')).toBe(content);
    });

    it('should handle heading with trailing anchor attributes', () => {
        const content = '## Setup {#setup}\n\nSetup text.\n\n## Usage';
        expect(extractSection(content, 'setup')).toBe('## Setup {#setup}\n\nSetup text.');
    });

    it('should skip headings inside fenced code blocks', () => {
        const content = [
            '## Section {#target}',
            '',
            '{% list tabs %}',
            '',
            '- Tab 1',
            '',
            '    ```',
            '    # Heading inside code block',
            '    ## Another heading',
            '    ```',
            '',
            '    More content.',
            '',
            '{% endlist %}',
            '',
            '## Next',
        ].join('\n');
        const result = extractSection(content, 'target');
        expect(result).toContain('{% list tabs %}');
        expect(result).toContain('# Heading inside code block');
        expect(result).toContain('{% endlist %}');
        expect(result).not.toContain('## Next');
    });

    it('should handle 4+ backtick fences in extractSection', () => {
        const content = [
            '## Section {#target}',
            '',
            '````',
            '## Fake heading',
            '````',
            '',
            'After code.',
            '',
            '## Next',
        ].join('\n');
        const result = extractSection(content, 'target');
        expect(result).toContain('## Fake heading');
        expect(result).toContain('After code.');
        expect(result).not.toContain('## Next');
    });

    it('should keep #### section when a shallower ## appears inside (popup-style)', () => {
        const content = [
            '#### {#indicator}',
            '',
            '## Inner title',
            '',
            'Body in section.',
            '',
            '#### {#next}',
            '',
            'After next.',
        ].join('\n');
        const result = extractSection(content, 'indicator');
        expect(result).toContain('#### {#indicator}');
        expect(result).toContain('## Inner title');
        expect(result).toContain('Body in section.');
        expect(result).not.toContain('#### {#next}');
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
        const parentContent = '{% include [ch](_includes/chapter.md) %}';
        const dep = makeDep({
            path: '_includes/chapter.md' as NormalizedPath,
            content: '---\ntitle: Chapter\n---\n[link](./local.md)',
            match: parentContent,
            location: [0, parentContent.length],
        });
        const result = prepareInlinedContent(dep, 'main.md' as NormalizedPath, parentContent);
        expect(result).toBe(
            '<!-- source: _includes/chapter.md -->\n[link](_includes/local.md)\n<!-- endsource: _includes/chapter.md -->',
        );
    });

    it('should strip first heading when notitle', () => {
        const parentContent = '{% include notitle [ch](_includes/chapter.md) %}';
        const dep = makeDep({
            path: '_includes/chapter.md' as NormalizedPath,
            content: '# Chapter Title\n\nBody text.',
            match: parentContent,
            location: [0, parentContent.length],
        });
        const result = prepareInlinedContent(dep, 'main.md' as NormalizedPath, parentContent);
        expect(result).toBe(
            '<!-- source: _includes/chapter.md -->\nBody text.\n<!-- endsource: _includes/chapter.md -->',
        );
    });

    it('should not strip heading without notitle', () => {
        const parentContent = '{% include [ch](_includes/chapter.md) %}';
        const dep = makeDep({
            path: '_includes/chapter.md' as NormalizedPath,
            content: '# Chapter Title\n\nBody.',
            match: parentContent,
            location: [0, parentContent.length],
        });
        const result = prepareInlinedContent(dep, 'main.md' as NormalizedPath, parentContent);
        expect(result).toBe(
            '<!-- source: _includes/chapter.md -->\n# Chapter Title\n\nBody.\n<!-- endsource: _includes/chapter.md -->',
        );
    });

    it('should not rebase when same directory', () => {
        const parentContent = '{% include [ch](docs/chapter.md) %}';
        const dep = makeDep({
            path: 'docs/chapter.md' as NormalizedPath,
            content: '[link](./local.md)',
            match: parentContent,
            location: [0, parentContent.length],
        });
        const result = prepareInlinedContent(dep, 'docs/main.md' as NormalizedPath, parentContent);
        expect(result).toBe(
            '<!-- source: docs/chapter.md -->\n[link](./local.md)\n<!-- endsource: docs/chapter.md -->',
        );
    });

    it('should add indent when include is indented (Step 2)', () => {
        const parentContent = '   {% include [ch](_includes/chapter.md) %}';
        const dep = makeDep({
            path: '_includes/chapter.md' as NormalizedPath,
            content: 'Line 1\nLine 2\nLine 3',
            match: '{% include [ch](_includes/chapter.md) %}',
            location: [3, parentContent.length],
        });
        const result = prepareInlinedContent(dep, 'main.md' as NormalizedPath, parentContent);
        expect(result).toBe(
            '<!-- source: _includes/chapter.md -->\n   Line 1\n   Line 2\n   Line 3\n   <!-- endsource: _includes/chapter.md -->',
        );
    });

    it('should preserve tab+space indent from parent (mixed whitespace)', () => {
        const parentContent = '\t {% include [ch](_includes/chapter.md) %}';
        const dep = makeDep({
            path: '_includes/chapter.md' as NormalizedPath,
            content: 'Line 1\nLine 2',
            match: '{% include [ch](_includes/chapter.md) %}',
            location: [2, parentContent.length],
        });
        const result = prepareInlinedContent(dep, 'main.md' as NormalizedPath, parentContent);
        expect(result).toBe(
            '<!-- source: _includes/chapter.md -->\n\t Line 1\n\t Line 2\n\t <!-- endsource: _includes/chapter.md -->',
        );
    });

    it('should use spaces for list `-` prefix, not repeat the marker on each line', () => {
        const include = '{% include [ch](_includes/chapter.md) %}';
        const parentContent = `- ${include}`;
        const dep = makeDep({
            path: '_includes/chapter.md' as NormalizedPath,
            content: 'First\nSecond',
            match: include,
            location: [2, parentContent.length],
        });
        const result = prepareInlinedContent(
            dep,
            'main.md' as NormalizedPath,
            parentContent,
            false,
        );
        expect(result).toBe('First\n  Second');
        expect(result).not.toContain('- Second');
    });

    it('should use spaces for list `*` prefix, not repeat the marker on each line', () => {
        const include = '{% include [ch](_includes/chapter.md) %}';
        const parentContent = `* ${include}`;
        const dep = makeDep({
            path: '_includes/chapter.md' as NormalizedPath,
            content: 'A\nB',
            match: include,
            location: [2, parentContent.length],
        });
        const result = prepareInlinedContent(
            dep,
            'main.md' as NormalizedPath,
            parentContent,
            false,
        );
        expect(result).toBe('A\n  B');
        expect(result).not.toContain('* B');
    });

    it('should preserve `>` blockquote prefix on continuation lines', () => {
        const include = '{% include [ch](_includes/chapter.md) %}';
        const parentContent = `> ${include}`;
        const dep = makeDep({
            path: '_includes/chapter.md' as NormalizedPath,
            content: 'Quoted line 1\nQuoted line 2',
            match: include,
            location: [2, parentContent.length],
        });
        const result = prepareInlinedContent(
            dep,
            'main.md' as NormalizedPath,
            parentContent,
            false,
        );
        expect(result).toBe('Quoted line 1\n> Quoted line 2');
    });

    it('should not indent YFM `#|` table with `>` when include sits in a blockquote', () => {
        const include = '{% include [t](_includes/table.md) %}';
        const parentContent = `> ${include}`;
        const dep = makeDep({
            path: '_includes/table.md' as NormalizedPath,
            content: '#|\n|| A ||\n|#',
            match: include,
            location: [2, parentContent.length],
        });
        const withMaps = prepareInlinedContent(
            dep,
            'main.md' as NormalizedPath,
            parentContent,
            true,
        );
        expect(withMaps).not.toContain('> #|');
        expect(withMaps).toMatch(/<!-- source:[^\n]*\n#\|/);

        const noMaps = prepareInlinedContent(
            dep,
            'main.md' as NormalizedPath,
            parentContent,
            false,
        );
        expect(noMaps).not.toContain('> #|');
        expect(noMaps.startsWith('\n')).toBe(true);
        expect(noMaps.trimStart().startsWith('#|')).toBe(true);
    });

    it('should preserve `> |` YFM table prefix on continuation lines', () => {
        const include = '{% include [ch](_includes/chapter.md) %}';
        const parentContent = `> |  ${include}`;
        const dep = makeDep({
            path: '_includes/chapter.md' as NormalizedPath,
            content: 'Cell line 1\nCell line 2',
            match: include,
            location: [5, parentContent.length],
        });
        const result = prepareInlinedContent(
            dep,
            'main.md' as NormalizedPath,
            parentContent,
            false,
        );
        expect(result).toBe('Cell line 1\n> |  Cell line 2');
    });

    it('should extract section by hash (Step 3)', () => {
        const parentContent = '{% include [ch](_includes/chapter.md#intro) %}';
        const dep = makeDep({
            path: '_includes/chapter.md' as NormalizedPath,
            link: '_includes/chapter.md#intro',
            content:
                '# Other\n\nIgnored.\n\n## Introduction {#intro}\n\nTarget content.\n\n## Next',
            match: parentContent,
            location: [0, parentContent.length],
        });
        const result = prepareInlinedContent(dep, 'main.md' as NormalizedPath, parentContent);
        expect(result).toBe(
            '<!-- source: _includes/chapter.md -->\n## Introduction {#intro}\n\nTarget content.\n<!-- endsource: _includes/chapter.md -->',
        );
    });

    it('should extract section by auto-generated slug (Step 3)', () => {
        const parentContent = '{% include [ch](_includes/chapter.md#getting-started) %}';
        const dep = makeDep({
            path: '_includes/chapter.md' as NormalizedPath,
            link: '_includes/chapter.md#getting-started',
            content: '# Intro\n\nSkipped.\n\n## Getting Started\n\nTarget.',
            match: parentContent,
            location: [0, parentContent.length],
        });
        const result = prepareInlinedContent(dep, 'main.md' as NormalizedPath, parentContent);
        expect(result).toBe(
            '<!-- source: _includes/chapter.md -->\n## Getting Started\n\nTarget.\n<!-- endsource: _includes/chapter.md -->',
        );
    });

    it('should add source map comment when enabled (Step 5)', () => {
        const parentContent = '{% include [ch](_includes/chapter.md) %}';
        const dep = makeDep({
            path: '_includes/chapter.md' as NormalizedPath,
            link: '_includes/chapter.md',
            content: '# Chapter Title\n\nBody text.',
            match: parentContent,
            location: [0, parentContent.length],
        });
        const result = prepareInlinedContent(dep, 'main.md' as NormalizedPath, parentContent, true);
        expect(result).toMatchSnapshot();
    });

    it('should not add source map comment when disabled (Step 5)', () => {
        const parentContent = '{% include [ch](_includes/chapter.md) %}';
        const dep = makeDep({
            path: '_includes/chapter.md' as NormalizedPath,
            link: '_includes/chapter.md',
            content: '# Chapter Title\n\nBody text.',
            match: parentContent,
            location: [0, parentContent.length],
        });
        const result = prepareInlinedContent(
            dep,
            'main.md' as NormalizedPath,
            parentContent,
            false,
        );
        expect(result).toMatchSnapshot();
    });

    it('should add source map comment after leading empty lines (Step 5)', () => {
        const parentContent = '{% include [ch](_includes/chapter.md) %}';
        const dep = makeDep({
            path: '_includes/chapter.md' as NormalizedPath,
            link: '_includes/chapter.md',
            content: '\n\n# Chapter Title\n\nBody text.',
            match: parentContent,
            location: [0, parentContent.length],
        });
        const result = prepareInlinedContent(dep, 'main.md' as NormalizedPath, parentContent, true);
        expect(result).toMatchSnapshot();
    });

    it('should not add source map comment for empty content (Step 5)', () => {
        const parentContent = '{% include [ch](_includes/chapter.md) %}';
        const dep = makeDep({
            path: '_includes/chapter.md' as NormalizedPath,
            link: '_includes/chapter.md',
            content: '',
            match: parentContent,
            location: [0, parentContent.length],
        });
        const result = prepareInlinedContent(dep, 'main.md' as NormalizedPath, parentContent, true);
        expect(result).toMatchSnapshot();
    });

    it('should not add source map comment for whitespace-only content (Step 5)', () => {
        const parentContent = '{% include [ch](_includes/chapter.md) %}';
        const dep = makeDep({
            path: '_includes/chapter.md' as NormalizedPath,
            link: '_includes/chapter.md',
            content: '   \n\n  \n',
            match: parentContent,
            location: [0, parentContent.length],
        });
        const result = prepareInlinedContent(dep, 'main.md' as NormalizedPath, parentContent, true);
        expect(result).toMatchSnapshot();
    });

    it('should add source map comment with indent preserved (Step 5)', () => {
        const parentContent = '  {% include [ch](_includes/chapter.md) %}';
        const dep = makeDep({
            path: '_includes/chapter.md' as NormalizedPath,
            link: '_includes/chapter.md',
            content: 'Line 1\nLine 2',
            match: '{% include [ch](_includes/chapter.md) %}',
            location: [2, parentContent.length],
        });
        const result = prepareInlinedContent(dep, 'main.md' as NormalizedPath, parentContent, true);
        expect(result).toMatchSnapshot();
    });

    it('should bare-inline include inside YFM table cell (prefix ends with ||...| )', () => {
        const include = '{% include [area](_includes/feed/elements/space.md#area) %}';
        const parentContent = `||\`area\`[*](*required)|${include}`;
        const dep = makeDep({
            path: '_includes/feed/elements/space.md' as NormalizedPath,
            link: '_includes/feed/elements/space.md#area',
            content: '## Area {#area}\n\nDescription of the area field.',
            match: include,
            location: [parentContent.indexOf(include), parentContent.length],
        });
        const result = prepareInlinedContent(dep, 'main.md' as NormalizedPath, parentContent, true);
        expect(result).toBe('## Area {#area}\n\nDescription of the area field.');
        expect(result).not.toContain('<!-- source');
    });

    it('should bare-inline include inside YFM table cell with bold header', () => {
        const include = '{% include [descr](_includes/owner-descr.md) %}';
        const parentContent = `||**Owner**|${include}`;
        const dep = makeDep({
            path: '_includes/owner-descr.md' as NormalizedPath,
            link: '_includes/owner-descr.md',
            content: 'Description of the owner field.',
            match: include,
            location: [parentContent.indexOf(include), parentContent.length],
        });
        const result = prepareInlinedContent(dep, 'main.md' as NormalizedPath, parentContent, true);
        expect(result).toBe('Description of the owner field.');
        expect(result).not.toContain('<!-- source');
        expect(result).not.toContain('\n');
    });

    it('should bare-inline include followed by YFM table separator (trailingSuffix)', () => {
        const include =
            '{% include [tmpl](_includes/concepts/complete-sample/id-complete-sample/template-universal_1.md) %}';
        const parentContent = `${include} ||`;
        const dep = makeDep({
            path: '_includes/concepts/complete-sample/id-complete-sample/template-universal_1.md' as NormalizedPath,
            link: '_includes/concepts/complete-sample/id-complete-sample/template-universal_1.md',
            content: 'Template content here.',
            match: include,
            location: [0, include.length],
        });
        const result = prepareInlinedContent(
            dep,
            'main.md' as NormalizedPath,
            parentContent,
            true,
            undefined,
            '||',
        );
        expect(result).toBe('Template content here.');
        expect(result).not.toContain('<!-- source');
        expect(result).not.toContain('\n');
    });

    it('should bare-inline notitle include inside YFM table cell', () => {
        const include = '{% include notitle [area](_includes/feed/elements/space.md#area) %}';
        const parentContent = `||Field|${include}`;
        const dep = makeDep({
            path: '_includes/feed/elements/space.md' as NormalizedPath,
            link: '_includes/feed/elements/space.md#area',
            content: '## Area {#area}\n\nField description.',
            match: include,
            location: [parentContent.indexOf(include), parentContent.length],
        });
        const result = prepareInlinedContent(dep, 'main.md' as NormalizedPath, parentContent, true);
        expect(result).toBe('Field description.');
        expect(result).not.toContain('<!-- source');
        expect(result).not.toContain('## Area');
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
    function makeMockRun(multilineTermDefinitions = true) {
        return {
            config: {content: {multilineTermDefinitions}},
            logger: {warn: () => {}},
        } as unknown as Parameters<typeof mergeIncludes>[0];
    }

    const mockRun = makeMockRun();

    async function runMerge(
        deps: HashedGraphNode[],
        parentContent: string,
        entry: NormalizedPath,
        run = mockRun,
    ): Promise<string> {
        const step = mergeIncludes(run, deps, parentContent);
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
        expect(result).toBe(
            '<!-- source: _includes/simple.md -->\nInlined text.\n<!-- endsource: _includes/simple.md -->',
        );
    });

    it('should inline include with hash, extracting section (Step 3)', async () => {
        const parentContent = '{% include [label](_includes/file.md#intro) %}';
        const dep = makeDep({
            path: '_includes/file.md' as NormalizedPath,
            link: '_includes/file.md#intro',
            match: parentContent,
            location: [0, parentContent.length],
            content: '# Other\n\nSkip.\n\n## Introduction {#intro}\n\nContent.',
            deps: [],
        });
        const result = await runMerge([dep], parentContent, 'main.md' as NormalizedPath);
        expect(result).toBe(
            '<!-- source: _includes/file.md -->\n## Introduction {#intro}\n\nContent.\n<!-- endsource: _includes/file.md -->',
        );
    });

    it('should inline indented include with addIndent (Step 2)', async () => {
        const parentContent = 'Text before\n  {% include [label](_includes/indented.md) %}';
        const dep = makeDep({
            path: '_includes/indented.md' as NormalizedPath,
            link: '_includes/indented.md',
            match: '{% include [label](_includes/indented.md) %}',
            location: [14, parentContent.length],
            content: 'Line 1\nLine 2',
            deps: [],
        });
        const result = await runMerge([dep], parentContent, 'main.md' as NormalizedPath);
        expect(result).toBe(
            'Text before\n  <!-- source: _includes/indented.md -->\n  Line 1\n  Line 2\n  <!-- endsource: _includes/indented.md -->',
        );
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
        expect(result).toBe(
            '<!-- source: _includes/chapter.md -->\nBody text.\n<!-- endsource: _includes/chapter.md -->',
        );
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
        expect(result).toBe(
            '<!-- source: _includes/chapter.md -->\n[link](_includes/local.md)\n<!-- endsource: _includes/chapter.md -->',
        );
    });

    it('should collect sub-deps of inlined include as fallback entries', async () => {
        const parentContent = '{% include [ch](_includes/outer.md) %}';
        const inner = makeDep({
            path: '_includes/inner.md' as NormalizedPath,
            link: 'inner.md',
            match: '{% include [i](inner.md) %}',
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

    it('should inline dep with terms, extract and append them (Step 4)', async () => {
        const inlinePart = '{% include [a](_includes/a.md) %}';
        const termsPart = '{% include [b](_includes/b.md) %}';
        const parentContent = `${inlinePart}\n${termsPart}`;

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
            link: '_includes/b.md',
            match: termsPart,
            location: [inlinePart.length + 1, parentContent.length],
            content: 'Content B.\n\n[*term]: Definition',
            deps: [],
        });
        const result = await runMerge([depA, depB], parentContent, 'main.md' as NormalizedPath);
        expect(result).toContain('Content A.');
        expect(result).toContain('Content B.');
        expect(result).not.toContain('{% included');
        expect(result).toContain('[*term]: Definition');
    });

    it('should inline dep with terms and collect sub-deps as fallback (Step 4)', async () => {
        const parentContent = '{% include [a](_includes/a.md) %}';
        const inner = makeDep({
            path: '_includes/inner.md' as NormalizedPath,
            link: 'inner.md',
            match: '{% include [i](inner.md) %}',
            content: 'Inner.',
            deps: [],
        });
        const dep = makeDep({
            path: '_includes/a.md' as NormalizedPath,
            link: '_includes/a.md',
            match: parentContent,
            location: [0, parentContent.length],
            content: 'Content with {% include [i](inner.md) %}!\n\n[*term]: Definition here',
            deps: [inner],
        });
        const result = await runMerge([dep], parentContent, 'main.md' as NormalizedPath);
        expect(result).toContain('Content with');
        expect(result).toContain('[*term]: Definition here');
        expect(result).toContain('{% included (_includes/inner.md) %}');
        expect(result).not.toContain('{% included (_includes/a.md) %}');
    });

    it('should use {% included %} for GFM bold-header table inside term section (safe paste)', async () => {
        const includeDirective = '{% include [ph](_includes/ph.md) %}';
        const parentContent = `Body.\n\n[*ph]: ${includeDirective}\n\n[*z]: Z`;
        const dep = makeDep({
            path: '_includes/ph.md' as NormalizedPath,
            link: '_includes/ph.md',
            match: includeDirective,
            location: [
                parentContent.indexOf(includeDirective),
                parentContent.indexOf(includeDirective) + includeDirective.length,
            ],
            content: '**Col A** | **Col B**\n----- | -----\nX | Y\n',
            deps: [],
        });
        const result = await runMerge([dep], parentContent, 'main.md' as NormalizedPath);
        expect(result).toContain('{% included (_includes/ph.md) %}');
        expect(result).toContain('**Col A**');
        expect(result).toContain('[*ph]:');
    });

    it('should use {% included %} for bold-bullet list dep inside multiline term', async () => {
        const includeDirective = '{% include [r](_includes/r.md) %}';
        const parentContent = `Intro\n\n[*t]:\n    ${includeDirective}\n\n[*z]: Z`;
        const dep = makeDep({
            path: '_includes/r.md' as NormalizedPath,
            link: '_includes/r.md',
            match: includeDirective,
            location: [
                parentContent.indexOf(includeDirective),
                parentContent.indexOf(includeDirective) + includeDirective.length,
            ],
            content: '- **A** — one\n- **B** — two\n',
            deps: [],
        });
        const result = await runMerge([dep], parentContent, 'main.md' as NormalizedPath);
        expect(result).toContain('{% included (_includes/r.md) %}');
        expect(result).toContain('- **A**');
    });

    it('should use {% included %} for only-include dep in blockquote multiline term', async () => {
        const includeDirective = '{% include [x](_includes/x.md) %}';
        const parentContent = `> [*wrap]:\n>   ${includeDirective}\n\n[*z]: Z`;
        const dep = makeDep({
            path: '_includes/x.md' as NormalizedPath,
            link: '_includes/x.md',
            match: includeDirective,
            location: [
                parentContent.indexOf(includeDirective),
                parentContent.indexOf(includeDirective) + includeDirective.length,
            ],
            content: '\n  {% include [i](inner.md) %}\n',
            deps: [],
        });
        const result = await runMerge([dep], parentContent, 'main.md' as NormalizedPath);
        expect(result).toContain('{% included (_includes/x.md) %}');
        expect(result).toContain('{% include [i](inner.md) %}');
    });

    it('should resolve include inside a term definition when multilineTerm=true', async () => {
        const includeDirective = '{% include notitle [desc](_includes/v.1.md#placeID) %}';
        const parentContent = `[*placeID]: ${includeDirective}`;
        const dep = makeDep({
            path: '_includes/v.1.md' as NormalizedPath,
            link: '_includes/v.1.md#placeID',
            match: includeDirective,
            location: [13, parentContent.length],
            content:
                '## PlaceID {#placeID}\n\nID площадки.\n\nЧитайте также:\n\n- [Список](list.md)',
            deps: [],
        });
        const result = await runMerge([dep], parentContent, 'main.md' as NormalizedPath);
        expect(result).toContain('[*placeID]:');
        expect(result).toContain('ID площадки.');
        expect(result).not.toContain('{% include');
        expect(result).not.toContain('{% included');
    });

    it('should NOT inline include inside a term definition when multilineTerm=false', async () => {
        const includeDirective = '{% include notitle [desc](_includes/v.1.md#placeID) %}';
        const parentContent = `[*placeID]: ${includeDirective}`;
        const dep = makeDep({
            path: '_includes/v.1.md' as NormalizedPath,
            link: '_includes/v.1.md#placeID',
            match: includeDirective,
            location: [13, parentContent.length],
            content:
                '## PlaceID {#placeID}\n\nID площадки.\n\nЧитайте также:\n\n- [Список](list.md)',
            deps: [],
        });
        const run = makeMockRun(false);
        const result = await runMerge([dep], parentContent, 'main.md' as NormalizedPath, run);
        expect(result).toContain('[*placeID]:');
        expect(result).toContain(includeDirective);
        expect(result).toContain('{% included (_includes/v.1.md) %}');
    });

    it('should NOT inline include in inline text context', async () => {
        const includeDirective = '{% include [snippet](_includes/note.md) %}';
        const parentContent = `See ${includeDirective} for details.`;
        const dep = makeDep({
            path: '_includes/note.md' as NormalizedPath,
            link: '_includes/note.md',
            match: includeDirective,
            location: [4, 4 + includeDirective.length],
            content: 'Important note.\n\nWith details.',
            deps: [],
        });
        const result = await runMerge([dep], parentContent, 'main.md' as NormalizedPath);
        expect(result).toContain('See {% include');
        expect(result).toContain('{% included (_includes/note.md) %}');
    });

    it('should resolve all includes in term section when multilineTerm=true', async () => {
        const termInclude = '{% include notitle [desc](_includes/v.1.md#placeID) %}';
        const noteInclude = '{% include notitle [note](_includes/notes.md#banner) %}';
        const parentContent = [`[*placeID]: ${termInclude}`, '    ', noteInclude].join('\n');

        const termStart = parentContent.indexOf(termInclude);
        const noteStart = parentContent.indexOf(noteInclude);

        const depTerm = makeDep({
            path: '_includes/v.1.md' as NormalizedPath,
            link: '_includes/v.1.md#placeID',
            match: termInclude,
            location: [termStart, termStart + termInclude.length],
            content: '## PlaceID {#placeID}\n\nID площадки.',
            deps: [],
        });
        const depNote = makeDep({
            path: '_includes/notes.md' as NormalizedPath,
            link: '_includes/notes.md#banner',
            match: noteInclude,
            location: [noteStart, noteStart + noteInclude.length],
            content: '## Banner {#banner}\n\n{% note info %}\n\nWarning text.\n\n{% endnote %}',
            deps: [],
        });

        const result = await runMerge(
            [depTerm, depNote],
            parentContent,
            'main.md' as NormalizedPath,
        );

        expect(result).not.toContain('{% include');
        expect(result).not.toContain('{% included');
        expect(result).toContain('ID площадки.');
        expect(result).toContain('{% note info %}');
        expect(result).toContain('[*placeID]:');
    });

    it('should NOT inline includes after first term definition when multilineTerm=false', async () => {
        const termInclude = '{% include notitle [desc](_includes/v.1.md#placeID) %}';
        const noteInclude = '{% include notitle [note](_includes/notes.md#banner) %}';
        const parentContent = [`[*placeID]: ${termInclude}`, '    ', noteInclude].join('\n');

        const termStart = parentContent.indexOf(termInclude);
        const noteStart = parentContent.indexOf(noteInclude);

        const depTerm = makeDep({
            path: '_includes/v.1.md' as NormalizedPath,
            link: '_includes/v.1.md#placeID',
            match: termInclude,
            location: [termStart, termStart + termInclude.length],
            content: '## PlaceID {#placeID}\n\nID площадки.',
            deps: [],
        });
        const depNote = makeDep({
            path: '_includes/notes.md' as NormalizedPath,
            link: '_includes/notes.md#banner',
            match: noteInclude,
            location: [noteStart, noteStart + noteInclude.length],
            content: '## Banner {#banner}\n\n{% note info %}\n\nWarning text.\n\n{% endnote %}',
            deps: [],
        });

        const run = makeMockRun(false);
        const result = await runMerge(
            [depTerm, depNote],
            parentContent,
            'main.md' as NormalizedPath,
            run,
        );

        expect(result).toContain(termInclude);
        expect(result).toContain(noteInclude);
        expect(result).toContain('{% included (_includes/v.1.md) %}');
        expect(result).toContain('{% included (_includes/notes.md) %}');
    });

    it('should add source map comments when enabled (Step 5)', async () => {
        const parentContent = '{% include [label](_includes/simple.md) %}';
        const dep = makeDep({
            path: '_includes/simple.md' as NormalizedPath,
            link: '_includes/simple.md',
            match: parentContent,
            location: [0, parentContent.length],
            content: 'Inlined text.',
            deps: [],
        });
        const run = makeMockRun();
        const step = mergeIncludes(run, [dep], parentContent, true);
        const scheduler = new Scheduler([step]);
        await scheduler.schedule('main.md' as NormalizedPath);
        const result = await scheduler.process(parentContent);
        expect(result).toMatchSnapshot();
    });

    it('should not add source map comments when disabled (Step 5)', async () => {
        const parentContent = '{% include [label](_includes/simple.md) %}';
        const dep = makeDep({
            path: '_includes/simple.md' as NormalizedPath,
            link: '_includes/simple.md',
            match: parentContent,
            location: [0, parentContent.length],
            content: 'Inlined text.',
            deps: [],
        });
        const run = makeMockRun();
        const step = mergeIncludes(run, [dep], parentContent, false);
        const scheduler = new Scheduler([step]);
        await scheduler.schedule('main.md' as NormalizedPath);
        const result = await scheduler.process(parentContent);
        expect(result).toMatchSnapshot();
    });

    it('should add source map comments with notitle (Step 5)', async () => {
        const parentContent = '{% include notitle [ch](_includes/chapter.md) %}';
        const dep = makeDep({
            path: '_includes/chapter.md' as NormalizedPath,
            link: '_includes/chapter.md',
            match: parentContent,
            location: [0, parentContent.length],
            content: '# Chapter Title\n\nBody text.',
            deps: [],
        });
        const run = makeMockRun();
        const step = mergeIncludes(run, [dep], parentContent, true);
        const scheduler = new Scheduler([step]);
        await scheduler.schedule('main.md' as NormalizedPath);
        const result = await scheduler.process(parentContent);
        expect(result).toMatchSnapshot();
    });

    it('should add source map comments with hash extraction (Step 5)', async () => {
        const parentContent = '{% include [label](_includes/file.md#intro) %}';
        const dep = makeDep({
            path: '_includes/file.md' as NormalizedPath,
            link: '_includes/file.md#intro',
            match: parentContent,
            location: [0, parentContent.length],
            content: '# Other\n\nSkip.\n\n## Introduction {#intro}\n\nContent.',
            deps: [],
        });
        const run = makeMockRun();
        const step = mergeIncludes(run, [dep], parentContent, true);
        const scheduler = new Scheduler([step]);
        await scheduler.schedule('main.md' as NormalizedPath);
        const result = await scheduler.process(parentContent);
        expect(result).toMatchSnapshot();
    });

    it('should add source map comments with indent (Step 5)', async () => {
        const parentContent = 'Text before\n  {% include [label](_includes/indented.md) %}';
        const dep = makeDep({
            path: '_includes/indented.md' as NormalizedPath,
            link: '_includes/indented.md',
            match: '{% include [label](_includes/indented.md) %}',
            location: [14, parentContent.length],
            content: 'Line 1\nLine 2',
            deps: [],
        });
        const run = makeMockRun();
        const step = mergeIncludes(run, [dep], parentContent, true);
        const scheduler = new Scheduler([step]);
        await scheduler.schedule('main.md' as NormalizedPath);
        const result = await scheduler.process(parentContent);
        expect(result).toMatchSnapshot();
    });

    it('should extract root terms and append them at the end (Step 4)', async () => {
        const includeDirective = '{% include [ch](_includes/chapter.md) %}';
        const parentContent = [
            includeDirective,
            '',
            '[*api]: Application Programming Interface',
        ].join('\n');
        const dep = makeDep({
            path: '_includes/chapter.md' as NormalizedPath,
            link: '_includes/chapter.md',
            match: includeDirective,
            location: [0, includeDirective.length],
            content: 'Chapter content.',
            deps: [],
        });
        const result = await runMerge([dep], parentContent, 'main.md' as NormalizedPath);
        const lines = result.split('\n');
        const termLine = lines.findIndex((l) => l.startsWith('[*api]:'));
        expect(termLine).toBeGreaterThan(0);
        expect(result).toContain('Chapter content.');
        expect(result).toContain('[*api]: Application Programming Interface');
    });

    it('should deduplicate identical terms from root and dep (Step 4)', async () => {
        const includeDirective = '{% include [ch](_includes/chapter.md) %}';
        const parentContent = [includeDirective, '', '[*api]: Same definition'].join('\n');
        const dep = makeDep({
            path: '_includes/chapter.md' as NormalizedPath,
            link: '_includes/chapter.md',
            match: includeDirective,
            location: [0, includeDirective.length],
            content: 'Chapter.\n\n[*api]: Same definition',
            deps: [],
        });
        const result = await runMerge([dep], parentContent, 'main.md' as NormalizedPath);
        const occurrences = result.split('[*api]:').length - 1;
        expect(occurrences).toBe(1);
    });

    it('should deduplicate identical terms when dep definition is list-indented (Step 4)', async () => {
        const includeDirective = '{% include [ch](_includes/chapter.md) %}';
        const def = 'Same definition text';
        const parentContent = [includeDirective, '', `[*api]: ${def}`].join('\n');
        const dep = makeDep({
            path: '_includes/chapter.md' as NormalizedPath,
            link: '_includes/chapter.md',
            match: includeDirective,
            location: [0, includeDirective.length],
            content: ['1. List context', '', `   [*api]: ${def}`].join('\n'),
            deps: [],
        });
        const result = await runMerge([dep], parentContent, 'main.md' as NormalizedPath);
        expect(result).toContain('1. List context');
        expect(result).not.toContain(`   [*api]: ${def}`);
        expect(result).toContain(`[*api]: ${def}`);
        expect(result.match(/\[\*api\]:/g)?.length).toBe(1);
        expect(result).not.toContain('[*api__');
    });

    it('should keep both terms with different keys from deps (Step 4)', async () => {
        const includeDirective = '{% include [ch](_includes/chapter.md) %}';
        const parentContent = includeDirective;
        const dep = makeDep({
            path: '_includes/chapter.md' as NormalizedPath,
            link: '_includes/chapter.md',
            match: includeDirective,
            location: [0, includeDirective.length],
            content: 'Content.\n\n[*api]: API def\n\n[*sdk]: SDK def',
            deps: [],
        });
        const result = await runMerge([dep], parentContent, 'main.md' as NormalizedPath);
        expect(result).toContain('[*api]: API def');
        expect(result).toContain('[*sdk]: SDK def');
        expect(result).toContain('Content.');
    });

    it('should rebase paths inside extracted term blocks (Step 4)', async () => {
        const includeDirective = '{% include [ch](_includes/chapter.md) %}';
        const parentContent = includeDirective;
        const dep = makeDep({
            path: '_includes/chapter.md' as NormalizedPath,
            link: '_includes/chapter.md',
            match: includeDirective,
            location: [0, includeDirective.length],
            content: 'Content.\n\n[*term]: See [docs](./local.md) for info',
            deps: [],
        });
        const result = await runMerge([dep], parentContent, 'main.md' as NormalizedPath);
        expect(result).toContain('[*term]: See [docs](_includes/local.md) for info');
    });

    it('should keep {% include %} in term body when resolved content is empty', async () => {
        const incA = '{% include [a](_includes/ascoltare.md) %}';
        const incD = '{% include [d](_includes/dom.md) %}';
        const parentContent = `Body.\n\n[*ascoltare]:\n    ${incA}\n\n[*dom]:\n    ${incD}`;
        const depA = makeDep({
            path: '_includes/ascoltare.md' as NormalizedPath,
            link: '_includes/ascoltare.md',
            match: incA,
            location: [parentContent.indexOf(incA), parentContent.indexOf(incA) + incA.length],
            content: '- **Option A** — desc\n- **Option B** — desc\n',
            deps: [],
        });
        const depD = makeDep({
            path: '_includes/dom.md' as NormalizedPath,
            link: '_includes/dom.md',
            match: incD,
            location: [parentContent.indexOf(incD), parentContent.indexOf(incD) + incD.length],
            content: '',
            deps: [],
        });
        const result = await runMerge([depA, depD], parentContent, 'main.md' as NormalizedPath);
        // dom include resolved to empty — original directive preserved in term body
        expect(result).toContain('[*dom]:');
        expect(result).toContain('{% include [d](_includes/dom.md) %}');
        // ascoltare goes to fallback (bold-bullet list)
        expect(result).toContain('{% included (_includes/ascoltare.md) %}');
        // dom definition should NOT absorb the ascoltare fallback
        const domPos = result.indexOf('[*dom]:');
        const includedPos = result.indexOf('{% included (_includes/ascoltare.md) %}');
        const domBlock = result.slice(domPos, includedPos);
        expect(domBlock).not.toContain('Option A');
    });
});
