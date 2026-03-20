import type {Run} from '~/commands/build';

import {describe, expect, it, vi} from 'vitest';

import {
    collectExternalLinksFromYaml,
    collectLinks,
    extractExternalLinks,
    extractIncludePaths,
} from './index';

describe('CrawlerManifest feature', () => {
    describe('extractExternalLinks', () => {
        it('extracts inline link [text](url)', () => {
            expect(extractExternalLinks('[text](https://example.com)')).toEqual([
                'https://example.com',
            ]);
        });

        it('extracts autolink <https://url>', () => {
            expect(extractExternalLinks('<https://example.com>')).toEqual(['https://example.com']);
        });

        it('extracts plain url (linkify)', () => {
            expect(extractExternalLinks('visit https://example.com today')).toContain(
                'https://example.com',
            );
        });

        it('extracts reference definition [ref]: url', () => {
            expect(extractExternalLinks('[ref]: https://example.com')).toContain(
                'https://example.com',
            );
        });

        it('extracts reference definition with leading whitespace', () => {
            expect(extractExternalLinks('  [ref]: https://example.com')).toContain(
                'https://example.com',
            );
        });

        it('extracts mailto link', () => {
            expect(extractExternalLinks('[mail](mailto:user@example.com)')).toContain(
                'mailto:user@example.com',
            );
        });

        it('ignores relative links', () => {
            expect(extractExternalLinks('[text](./relative.md)')).toEqual([]);
        });

        it('ignores absolute local links', () => {
            expect(extractExternalLinks('[text](/absolute/path.md)')).toEqual([]);
        });

        it('deduplicates identical urls', () => {
            const content = '[a](https://example.com)\nhttps://example.com';
            const links = extractExternalLinks(content);
            expect(links.filter((l) => l === 'https://example.com')).toHaveLength(1);
        });

        it('returns empty array when no external links', () => {
            expect(extractExternalLinks('[relative](./page.md)\n[absolute](/docs.md)')).toEqual([]);
        });

        it('extracts all link types from mixed content', () => {
            const content = `
# Title

[inline](https://inline.example.com)

<https://autolink.example.com>

plain https://plain.example.com text

[ref]: https://ref.example.com
`.trim();

            const links = extractExternalLinks(content);
            expect(links).toContain('https://inline.example.com');
            expect(links).toContain('https://autolink.example.com');
            expect(links).toContain('https://plain.example.com');
            expect(links).toContain('https://ref.example.com');
        });

        it('ignores links inside fenced code block with language', () => {
            const content = '```yaml\nlink: [text](https://code.example.com)\n```';
            expect(extractExternalLinks(content)).toEqual([]);
        });

        it('ignores links inside tilde code block', () => {
            const content = '~~~\n[text](https://tilde.example.com)\n~~~';
            expect(extractExternalLinks(content)).toEqual([]);
        });

        it('extracts image url ![alt](url)', () => {
            expect(extractExternalLinks('![img](https://image.example.com)')).toContain(
                'https://image.example.com',
            );
        });

        it('extracts both image and link urls', () => {
            const content = '![img](https://image.example.com)\n[text](https://link.example.com)';
            const links = extractExternalLinks(content);
            expect(links).toContain('https://image.example.com');
            expect(links).toContain('https://link.example.com');
        });

        it('ignores links inside HTML comments', () => {
            const content = '<!-- [hidden](https://comment.example.com) -->';
            expect(extractExternalLinks(content)).toEqual([]);
        });

        it('ignores multiline HTML comment with link', () => {
            const content = '<!--\nhttps://hidden.example.com\n-->';
            expect(extractExternalLinks(content)).toEqual([]);
        });

        it('strips trailing punctuation from plain urls', () => {
            expect(extractExternalLinks('Visit https://example.com.')).toEqual([
                'https://example.com',
            ]);
            expect(extractExternalLinks('See https://example.com, and more')).toEqual([
                'https://example.com',
            ]);
            expect(extractExternalLinks('Is it https://example.com?')).toEqual([
                'https://example.com',
            ]);
        });

        it('extracts url with fragment', () => {
            expect(extractExternalLinks('[text](https://example.com#section)')).toEqual([
                'https://example.com#section',
            ]);
        });

        it('extracts url with query params', () => {
            expect(extractExternalLinks('[text](https://example.com?q=1&a=2)')).toEqual([
                'https://example.com?q=1&a=2',
            ]);
        });

        it('extracts link with title attribute', () => {
            expect(extractExternalLinks('[text](https://example.com "title")')).toEqual([
                'https://example.com',
            ]);
        });

        it('handles multiple inline codes on the same line', () => {
            const content =
                '`https://a.example.com` text [link](https://b.example.com) `https://c.example.com`';
            expect(extractExternalLinks(content)).toEqual(['https://b.example.com']);
        });

        it('extracts protocol-relative url', () => {
            expect(extractExternalLinks('[link](//cdn.example.com/lib.js)')).toContain(
                '//cdn.example.com/lib.js',
            );
        });

        it('extracts tel: link', () => {
            expect(extractExternalLinks('[call](tel:+1234567890)')).toContain('tel:+1234567890');
        });

        it('extracts ftp:// link', () => {
            expect(extractExternalLinks('[files](ftp://files.example.com)')).toContain(
                'ftp://files.example.com',
            );
        });

        it('extracts autolink with mailto', () => {
            expect(extractExternalLinks('<mailto:user@example.com>')).toContain(
                'mailto:user@example.com',
            );
        });

        it('extracts file block src', () => {
            expect(
                extractExternalLinks('{% file src="https://cdn.example.com/doc.pdf" name="doc" %}'),
            ).toContain('https://cdn.example.com/doc.pdf');
        });

        it('ignores file block with local src', () => {
            expect(extractExternalLinks('{% file src="./local.pdf" name="doc" %}')).toEqual([]);
        });

        it('extracts video embed url', () => {
            expect(extractExternalLinks('@[youtube](https://youtube.com/watch?v=abc)')).toContain(
                'https://youtube.com/watch?v=abc',
            );
        });
    });

    describe('extractIncludePaths', () => {
        it('extracts include path', () => {
            expect(extractIncludePaths('{% include [label](./snippet.md) %}')).toEqual([
                './snippet.md',
            ]);
        });

        it('extracts multiple include paths', () => {
            const content = '{% include [a](a.md) %}\ntext\n{% include [b](../shared/b.md) %}';
            expect(extractIncludePaths(content)).toEqual(['a.md', '../shared/b.md']);
        });

        it('ignores includes inside code blocks', () => {
            const content = '```\n{% include [label](snippet.md) %}\n```';
            expect(extractIncludePaths(content)).toEqual([]);
        });

        it('ignores includes inside inline code', () => {
            expect(extractIncludePaths('`{% include [l](s.md) %}`')).toEqual([]);
        });

        it('ignores includes with external urls', () => {
            expect(
                extractIncludePaths('{% include [label](https://example.com/file.md) %}'),
            ).toEqual([]);
        });

        it('extracts include when label contains percent sign', () => {
            expect(extractIncludePaths('{% include [налог 3%](_includes/tax-new.md) %}')).toEqual([
                '_includes/tax-new.md',
            ]);
        });

        it('extracts include path without space before bracket (notitle form)', () => {
            expect(extractIncludePaths('{% include[label](./snippet.md) %}')).toEqual([
                './snippet.md',
            ]);
        });

        it('returns empty for content without includes', () => {
            expect(extractIncludePaths('Just regular [link](https://example.com) text')).toEqual(
                [],
            );
        });
    });

    describe('collectExternalLinksFromYaml', () => {
        it('extracts external link from href field', () => {
            expect(collectExternalLinksFromYaml('href: https://example.com')).toContain(
                'https://example.com',
            );
        });

        it('extracts external link from nested url field', () => {
            expect(
                collectExternalLinksFromYaml('navigation:\n  href: https://nav.example.com'),
            ).toContain('https://nav.example.com');
        });

        it('ignores relative href value', () => {
            expect(collectExternalLinksFromYaml('href: ./relative.md')).toEqual([]);
        });

        it('returns empty on invalid YAML', () => {
            expect(collectExternalLinksFromYaml(': invalid: {unclosed')).toEqual([]);
        });

        it('returns empty when YAML is null', () => {
            expect(collectExternalLinksFromYaml('')).toEqual([]);
        });

        it('returns empty when YAML is a scalar', () => {
            expect(collectExternalLinksFromYaml('just a string')).toEqual([]);
        });
    });

    describe('stripFencedBlocks (via extractExternalLinks)', () => {
        it('strips unclosed fenced block to end of content', () => {
            expect(extractExternalLinks('```\n[link](https://unclosed.example.com)')).toEqual([]);
        });

        it('tilde fence does not close backtick fence', () => {
            const content = '```\n[inside](https://inside.example.com)\n~~~\nstill inside\n```';

            expect(extractExternalLinks(content)).toEqual([]);
        });

        it('shorter fence does not close longer opening fence', () => {
            const content = '````\n[inside](https://inside.example.com)\n```\nnot closed\n````';

            expect(extractExternalLinks(content)).toEqual([]);
        });

        it('handles CRLF line endings correctly', () => {
            const content =
                '```\r\n[inside](https://inside.example.com)\r\n```\r\n[outside](https://outside.example.com)';
            const links = extractExternalLinks(content);

            expect(links).not.toContain('https://inside.example.com');
            expect(links).toContain('https://outside.example.com');
        });

        it('content after closed fence is included', () => {
            const content =
                '```\n[inside](https://inside.example.com)\n```\n[outside](https://outside.example.com)';
            const links = extractExternalLinks(content);

            expect(links).not.toContain('https://inside.example.com');
            expect(links).toContain('https://outside.example.com');
        });
    });

    describe('collectLinks', () => {
        const makeRun = (files: Record<string, string>) =>
            ({
                input: '/input',
                read: vi.fn(async (absolutePath: string) => {
                    const relative = absolutePath.replace(/\\/g, '/').replace(/^\/input\//, '');

                    if (relative in files) {
                        return files[relative];
                    }

                    throw new Error(`File not found: ${absolutePath}`);
                }),
            }) as unknown as Run;

        it('extracts links from a markdown file', async () => {
            const run = makeRun({'page.md': '[link](https://example.com)'});

            expect(await collectLinks(run, 'page.md')).toContain('https://example.com');
        });

        it('returns empty array when file cannot be read', async () => {
            const run = makeRun({});

            expect(await collectLinks(run, 'missing.md')).toEqual([]);
        });

        it('returns empty array for already-visited file (circular protection)', async () => {
            const run = makeRun({'page.md': '[link](https://example.com)'});
            const visited = new Set(['page.md']);

            expect(await collectLinks(run, 'page.md', visited)).toEqual([]);
        });

        it('extracts links from YAML file including structured keys', async () => {
            const run = makeRun({
                'data.yaml': 'href: https://yaml.example.com',
            });

            expect(await collectLinks(run, 'data.yaml')).toContain('https://yaml.example.com');
        });

        it('extracts links from .yml file', async () => {
            const run = makeRun({
                'data.yml': 'href: https://yml.example.com',
            });

            expect(await collectLinks(run, 'data.yml')).toContain('https://yml.example.com');
        });

        it('recursively extracts links from included markdown files', async () => {
            const run = makeRun({
                'page.md': '{% include [snippet](./_includes/snippet.md) %}',
                '_includes/snippet.md': '[link](https://included.example.com)',
            });

            expect(await collectLinks(run, 'page.md')).toContain('https://included.example.com');
        });

        it('does not follow includes from YAML files', async () => {
            const run = makeRun({
                'data.yaml': 'href: https://yaml.example.com',
                'snippet.md': '[link](https://shouldnotappear.example.com)',
            });
            const links = await collectLinks(run, 'data.yaml');

            expect(links).toContain('https://yaml.example.com');
            expect(links).not.toContain('https://shouldnotappear.example.com');
        });

        it('skips unreadable include files gracefully', async () => {
            const run = makeRun({
                'page.md': '{% include [missing](./missing.md) %}\n[link](https://example.com)',
            });

            expect(await collectLinks(run, 'page.md')).toContain('https://example.com');
        });
    });
});
