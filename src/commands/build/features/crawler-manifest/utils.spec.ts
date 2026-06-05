import type {Run} from '~/commands/build';

import {describe, expect, it, vi} from 'vitest';

import {
    collectCrawlerExcludes,
    collectExternalLinksFromYaml,
    collectLinks,
    crawlerNotifications,
    extractExternalLinks,
    extractIncludePaths,
    parseRegexps,
} from './utils';

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

    describe('parseRegexps', () => {
        it('parses a JS regexp literal /pattern/flags', () => {
            const [re] = parseRegexps(['/example\\.com/']);
            expect(re.test('https://example.com')).toBe(true);
            expect(re.test('https://other.com')).toBe(false);
        });

        it('parses a regexp literal with flags', () => {
            const [re] = parseRegexps(['/EXAMPLE/i']);
            expect(re.flags).toContain('i');
            expect(re.test('https://example.com')).toBe(true);
        });

        it('treats a plain string as a regexp pattern when not wrapped in slashes', () => {
            const [re] = parseRegexps(['example\\.com']);
            expect(re.test('https://example.com')).toBe(true);
        });

        it('skips non-string entries', () => {
            expect(parseRegexps([null, 42, true])).toHaveLength(0);
        });

        it('skips invalid regexp patterns', () => {
            expect(parseRegexps(['/[invalid/'])).toHaveLength(0);
        });

        it('returns empty array for empty input', () => {
            expect(parseRegexps([])).toEqual([]);
        });
    });

    describe('collectCrawlerExcludes', () => {
        it('collects exclude urls from root crawler config', () => {
            const result = collectCrawlerExcludes({
                crawler: {
                    exclude: {
                        url: ['https://root.example.com'],
                    },
                },
            });

            expect(result.urls).toEqual(['https://root.example.com']);
            expect(result.regexps).toEqual([]);
        });

        it('collects exclude urls from docs-viewer crawler config', () => {
            const result = collectCrawlerExcludes({
                'docs-viewer': {
                    crawler: {
                        exclude: {
                            url: ['https://docs-viewer.example.com'],
                        },
                    },
                },
            });

            expect(result.urls).toEqual(['https://docs-viewer.example.com']);
            expect(result.regexps).toEqual([]);
        });

        it('merges exclude urls from root and docs-viewer configs', () => {
            const result = collectCrawlerExcludes({
                crawler: {
                    exclude: {
                        url: ['https://root.example.com'],
                    },
                },
                'docs-viewer': {
                    crawler: {
                        exclude: {
                            url: ['https://docs-viewer.example.com'],
                        },
                    },
                },
            });

            expect(result.urls).toEqual([
                'https://root.example.com',
                'https://docs-viewer.example.com',
            ]);
        });

        it('filters out non-string exclude urls', () => {
            const result = collectCrawlerExcludes({
                crawler: {
                    exclude: {
                        url: ['https://root.example.com', 123, null, true],
                    },
                },
            });

            expect(result.urls).toEqual(['https://root.example.com']);
        });

        it('collects regexp excludes from root crawler config', () => {
            const result = collectCrawlerExcludes({
                crawler: {
                    exclude: {
                        regexp: ['/root\\.example\\.com/'],
                    },
                },
            });

            expect(result.regexps).toHaveLength(1);
            expect(result.regexps[0].test('https://root.example.com')).toBe(true);
            expect(result.regexps[0].test('https://other.example.com')).toBe(false);
        });

        it('collects regexp excludes from docs-viewer crawler config', () => {
            const result = collectCrawlerExcludes({
                'docs-viewer': {
                    crawler: {
                        exclude: {
                            regexp: ['/docs-viewer\\.example\\.com/'],
                        },
                    },
                },
            });

            expect(result.regexps).toHaveLength(1);
            expect(result.regexps[0].test('https://docs-viewer.example.com')).toBe(true);
            expect(result.regexps[0].test('https://other.example.com')).toBe(false);
        });

        it('merges regexp excludes from root and docs-viewer configs', () => {
            const result = collectCrawlerExcludes({
                crawler: {
                    exclude: {
                        regexp: ['/root\\.example\\.com/'],
                    },
                },
                'docs-viewer': {
                    crawler: {
                        exclude: {
                            regexp: ['/docs-viewer\\.example\\.com/'],
                        },
                    },
                },
            });

            expect(result.regexps).toHaveLength(2);
            expect(result.regexps.some((re) => re.test('https://root.example.com'))).toBe(true);
            expect(result.regexps.some((re) => re.test('https://docs-viewer.example.com'))).toBe(
                true,
            );
        });

        it('collects urls and regexps together', () => {
            const result = collectCrawlerExcludes({
                crawler: {
                    exclude: {
                        url: ['https://exact.example.com'],
                        regexp: ['/regexp\\.example\\.com/'],
                    },
                },
            });

            expect(result.urls).toEqual(['https://exact.example.com']);
            expect(result.regexps).toHaveLength(1);
            expect(result.regexps[0].test('https://regexp.example.com')).toBe(true);
        });

        it('ignores non-array url and regexp values', () => {
            const result = collectCrawlerExcludes({
                crawler: {
                    exclude: {
                        url: 'https://example.com',
                        regexp: '/example\\.com/',
                    },
                },
            });

            expect(result.urls).toEqual([]);
            expect(result.regexps).toEqual([]);
        });

        it('filters invalid regexp patterns through parseRegexps', () => {
            const result = collectCrawlerExcludes({
                crawler: {
                    exclude: {
                        regexp: ['/valid\\.example\\.com/', '/[invalid/'],
                    },
                },
            });

            expect(result.regexps).toHaveLength(1);
            expect(result.regexps[0].test('https://valid.example.com')).toBe(true);
        });

        it('returns empty values when crawler exclude config is missing', () => {
            const result = collectCrawlerExcludes({});

            expect(result.urls).toEqual([]);
            expect(result.regexps).toEqual([]);
        });
    });

    describe('crawlerNotifications', () => {
        it('returns undefined when no notifications config', () => {
            expect(crawlerNotifications({})).toBeUndefined();
        });

        it('returns undefined when notifications config has no receivers', () => {
            expect(
                crawlerNotifications({
                    crawler: {notifications: {interval: 'daily'} as never},
                }),
            ).toBeUndefined();
        });

        it('returns undefined when receivers is empty array', () => {
            expect(
                crawlerNotifications({
                    crawler: {notifications: {receivers: []}},
                }),
            ).toBeUndefined();
        });

        it('applies default interval and channels from root config', () => {
            const result = crawlerNotifications({
                crawler: {notifications: {receivers: ['user1']}},
            });

            expect(result).toEqual({
                receivers: ['user1'],
                interval: 'weekly',
                channels: ['email'],
            });
        });

        it('preserves explicit interval and channels from root config', () => {
            const result = crawlerNotifications({
                crawler: {
                    notifications: {
                        receivers: ['user1'],
                        interval: 'monthly',
                        channels: ['email', 'messenger'],
                    },
                },
            });

            expect(result).toEqual({
                receivers: ['user1'],
                interval: 'monthly',
                channels: ['email', 'messenger'],
            });
        });

        it('reads notifications from docs-viewer config', () => {
            const result = crawlerNotifications({
                'docs-viewer': {
                    crawler: {notifications: {receivers: ['user2'], interval: 'daily'}},
                },
            });

            expect(result).toEqual({
                receivers: ['user2'],
                interval: 'daily',
                channels: ['email'],
            });
        });

        it('root config takes priority over docs-viewer when both are set', () => {
            const result = crawlerNotifications({
                crawler: {
                    notifications: {
                        receivers: ['root-user'],
                        interval: 'monthly',
                        channels: ['messenger'],
                    },
                },
                'docs-viewer': {
                    crawler: {
                        notifications: {
                            receivers: ['viewer-user'],
                            interval: 'daily',
                        },
                    },
                },
            });

            expect(result).toEqual({
                receivers: ['root-user'],
                interval: 'monthly',
                channels: ['messenger'],
            });
        });

        it('uses root config entirely, docs-viewer interval is ignored', () => {
            const result = crawlerNotifications({
                crawler: {notifications: {receivers: ['root-user']}},
                'docs-viewer': {crawler: {notifications: {interval: 'daily'} as never}},
            });

            expect(result).toEqual({
                receivers: ['root-user'],
                interval: 'weekly',
                channels: ['email'],
            });
        });

        it('returns undefined when both configs present but neither has receivers', () => {
            expect(
                crawlerNotifications({
                    crawler: {notifications: {interval: 'daily'} as never},
                    'docs-viewer': {crawler: {notifications: {interval: 'weekly'} as never}},
                }),
            ).toBeUndefined();
        });
    });
});
