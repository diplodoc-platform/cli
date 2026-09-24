import type {JSONObject} from '@diplodoc/translation';

import {describe, expect, it} from 'vitest';

import {alignBlocks, lcs, linkRelation, parseBlocks, unitAnchors, unitProse} from './align';

const unit = (text: string) => `<source xml:space="preserve">${text}</source>`;

/** Builds a markdown skeleton and units from lines with `[[unit texts]]`: one placeholder per text. */
function document(lines: string[]): {skeleton: string; units: string[]} {
    const units: string[] = [];
    const skeleton = lines
        .map((line) =>
            line.replace(/\[\[(.*?)\]\]/g, (_, text: string) => {
                units.push(unit(text));
                return `%%%${units.length - 1}%%%`;
            }),
        )
        .join('\n');
    return {skeleton, units};
}

const blocksOf = (lines: string[]) => {
    const {skeleton, units} = document(lines);
    return parseBlocks(skeleton, units);
};

describe('translate seed alignment', () => {
    describe('unitAnchors', () => {
        it('should collect numbers, code spans and link destinations', () => {
            const text =
                'Release 2.11.0 from 2026-07-31 uses ' +
                '<x ctype="code_open" equiv-text="`" id="x-1"/>spark.yt.enabled<x ctype="code_close" equiv-text="`" id="x-2"/> ' +
                'see <g ctype="link" equiv-text="[{{text}}](https://example.com/a)" id="g-1" x-begin="[" x-end="](https://example.com/a)">docs</g>.';

            expect(unitAnchors(unit(text))).toEqual([
                'code:spark.yt.enabled',
                'num:07',
                'num:2.11.0',
                'num:2026',
                'num:31',
                'url:https://example.com/a',
            ]);
        });

        describe('links of localized pages', () => {
            const link = (url: string) =>
                unit(
                    `<g ctype="link" equiv-text="[{{text}}](${url})" id="g-1" x-begin="[" x-end="](${url})">docs</g>`,
                );
            const EN_RU = ['en', 'ru'];

            it.each([
                ['https://example.com/docs/en/gpu', 'https://example.com/docs/ru/gpu'],
                [
                    'https://example.com/docs/api/check.html',
                    'https://example.org/docs/api/check.html',
                ],
                ['../ru/concepts/page.md#section', '../en/concepts/page.md#section'],
                ['https://example.com/docs/ru', 'https://example.com/docs/en/'],
                ['/en-us/docs/', '/ru-ru/docs'],
            ])('should compare %j and %j as one page', (from, to) => {
                expect(unitAnchors(link(from), EN_RU)).toEqual(unitAnchors(link(to), EN_RU));
            });

            it.each([
                ['https://example.com/docs/en/gpu', 'https://example.com/docs/en/cpu'],
                ['https://x.y/ui/page.html', 'https://x.y/ui/other.html'],
                ['pragmas.md#yt.FileCacheTtl', 'pragmas.md#yt.TableContentTmpFolder'],
                // Pages of the same name in different sections pin no blocks.
                ['compute/index.md', 'storage/index.md'],
                [
                    'https://example.com/docs/api/v5/changes/check.html',
                    'https://example.org/docs/api/changes/check.html',
                ],
            ])('should tell %j from %j', (from, to) => {
                expect(unitAnchors(link(from), EN_RU)).not.toEqual(unitAnchors(link(to), EN_RU));
            });

            it('should key a link by its path without the domain and language, query and section', () => {
                expect(unitAnchors(link('https://x.y/en/a/b.md?x=1#y'), EN_RU)).toEqual([
                    'url:a/b.md?x=1#y',
                ]);
            });

            it('should keep the links as they are without languages', () => {
                expect(unitAnchors(link('https://example.com/docs/en/gpu'))).toEqual([
                    'url:https://example.com/docs/en/gpu',
                ]);
            });
        });

        it('should ignore numbers inside tag attributes and entities', () => {
            const text = 'Line<x ctype="lb" equiv-text="&amp;#10;" id="x-12"/>break and&#160;space';

            expect(unitAnchors(unit(text))).toEqual([]);
        });

        it('should read a code span whose closing marker was hoisted into the skeleton', () => {
            const open = 'Enabled by <x ctype="code_open" equiv-text="`" id="x-1"/>spark.enabled';
            const close = 'spark.enabled<x ctype="code_close" equiv-text="`" id="x-1"/> is the key';

            expect(unitAnchors(unit(open))).toEqual(['code:spark.enabled']);
            expect(unitAnchors(unit(close))).toEqual(['code:spark.enabled']);
        });

        it.each([
            ['[Note]: e.g. the value is ignored.', []],
            ['[Deadline]: 12:00 sharp.', []],
            ['[ref]: /docs/admin/install.md', ['url:/docs/admin/install.md']],
            ['[ref]: install.md', ['url:install.md']],
        ])(
            'should read %j as a reference definition only when it holds an address',
            (text, anchors) => {
                expect(
                    unitAnchors(unit(text)).filter((anchor) => anchor.startsWith('url:')),
                ).toEqual(anchors);
            },
        );

        it('should keep bare urls of the text', () => {
            expect(unitAnchors(unit('See https://example.com/x?y=1 for details'))).toEqual([
                'num:1',
                'url:https://example.com/x?y=1',
            ]);
        });
    });

    describe('parseBlocks', () => {
        it('should split a markdown skeleton into lines carrying placeholders', () => {
            const blocks = blocksOf([
                '# [[Title]]',
                '',
                '[[First.]] [[Second.]] [[Third.]]',
                '',
                '- [[Item one.]]',
                '- [[Item two with]] [[two sentences.]]',
                '  [[Continuation.]]',
                '',
                '{% cut "**[[2.11.0]]**" %}',
                '',
                '**[[Release page:]] 2.11.0](https://example.com/2.11.0)',
                '',
                '{% endcut %}',
            ]);

            expect(blocks.map((block) => block.signature)).toEqual([
                '# %%%',
                '%%% %%% %%%',
                '- %%%',
                '- %%% %%%',
                '  %%%',
                '{% cut "%%%" %}',
                '%%% 2.11.0](https://example.com/2.11.0)',
            ]);
            expect(blocks.map((block) => block.structure)).toEqual([
                '# %%%',
                '%%%',
                '- %%%',
                '- %%%',
                '  %%%',
                '{% cut "%%%" %}',
                '%%% 2.11.0](https://example.com/2.11.0)',
            ]);
            expect(blocks.map((block) => block.units)).toEqual([
                [0],
                [1, 2, 3],
                [4],
                [5, 6],
                [7],
                [8],
                [9],
            ]);
            expect(blocks[5].anchors).toEqual(['num:2.11.0']);
            expect(blocks[5].key).not.toBe(blocksOf(['{% cut "**[[2.10.0]]**" %}'])[0].key);
        });

        it('should ignore inline markup and list marker flavours in signatures', () => {
            const [dash] = blocksOf(['- [[Text with]] `code`']);
            const [star] = blocksOf(['* [[Text with]]']);
            const [plain] = blocksOf(['[[Text with]]']);
            const [trailing] = blocksOf(['- [[Text with]]  ']);
            const [first] = blocksOf(['1. [[Text]]']);
            const [third] = blocksOf(['3. [[Text]]']);

            expect(dash.signature).toBe('- %%% code');
            expect(star.signature).toBe('- %%%');
            expect(plain.signature).toBe('%%%');
            expect(trailing.signature).toBe('- %%%');
            expect(first.signature).toBe('1. %%%');
            expect(third.signature).toBe('1. %%%');
        });

        it('should append units missing from the skeleton as their own blocks', () => {
            const blocks = parseBlocks('%%%0%%%', [unit('One.'), unit('Orphan.')]);

            expect(blocks.map((block) => block.units)).toEqual([[0], [1]]);
        });

        it('should turn an object skeleton into property-path blocks with scalar siblings as anchors', () => {
            const units = [unit('Overview'), unit('Concepts'), unit('Deep')];
            const skeleton: JSONObject = {
                title: 'Docs',
                items: [
                    {name: '%%%0%%%', href: 'overview.md'},
                    {name: '%%%1%%%', items: [{name: '%%%2%%%', href: 'deep.md', hidden: true}]},
                ],
            };

            const blocks = parseBlocks(skeleton, units);

            expect(blocks.map((block) => block.signature)).toEqual([
                'items[].name',
                'items[].name',
                'items[].items[].name',
            ]);
            expect(blocks[0].anchors).toEqual(['ctx:href=overview.md']);
            expect(blocks[1].anchors).toEqual([]);
            expect(blocks[2].anchors).toEqual(['ctx:hidden=true', 'ctx:href=deep.md']);
        });
    });

    describe('lcs', () => {
        it('should return monotonic pairs of equal items', () => {
            expect(lcs(['a', 'b', 'c', 'd'], ['b', 'x', 'd'])).toEqual([
                [1, 0],
                [3, 2],
            ]);
        });

        it('should keep the common prefix and suffix', () => {
            expect(lcs(['a', 'b', 'c'], ['a', 'z', 'c'])).toEqual([
                [0, 0],
                [2, 2],
            ]);
        });
    });

    describe('alignBlocks', () => {
        const section = (version: string, items: string[]) => [
            `{% cut "**[[${version}]]**" %}`,
            '',
            `**[[Release date:]] 2026-0${version.at(-1)}-01`,
            '',
            `**[[Release page:]] ${version}](https://example.com/${version})`,
            '',
            '[[Summary of the release.]]',
            '',
            ...items.map((item) => `- [[${item}]]`),
            '',
            '{% endcut %}',
            '',
        ];

        it('should pair every block of structurally identical documents', () => {
            const source = blocksOf(['# [[A]]', '', '[[B.]] [[C.]]', '', '- [[D]]', '- [[E]]']);
            const target = blocksOf(['# [[a]]', '', '[[b.]] [[c.]]', '', '- [[d]]', '- [[e]]']);

            expect(alignBlocks(source, target)).toEqual([
                [0, 0],
                [1, 1],
                [2, 2],
                [3, 3],
            ]);
        });

        it('should leave an inserted section unmatched and keep the rest paired', () => {
            const source = blocksOf([
                '# [[Releases]]',
                '',
                ...section('2.11.1', ['New feature', 'Support `schema_hint`']),
                ...section('2.11.0', ['Spark 4.2 support', 'Other fixes']),
            ]);
            const target = blocksOf([
                '# [[Релизы]]',
                '',
                ...section('2.11.0', ['Поддержка Spark 4.2', 'Прочие исправления']),
            ]);

            const pairs = alignBlocks(source, target);

            // Heading plus the six blocks of the 2.11.0 section.
            expect(pairs).toHaveLength(7);
            expect(pairs).toContainEqual([0, 0]);
            const paired = new Set(pairs.map(([i]) => i));
            for (let i = 1; i <= 6; i++) {
                expect(paired.has(i)).toBe(false);
            }
        });

        it('should not guess inside a list that gained an item', () => {
            const source = blocksOf([
                '[[Intro.]]',
                '',
                '- [[One]]',
                '- [[Added]]',
                '- [[Two]]',
                '- [[Three 3]]',
            ]);
            const target = blocksOf([
                '[[Вступление.]]',
                '',
                '- [[Раз]]',
                '- [[Два]]',
                '- [[Три 3]]',
            ]);

            const pairs = alignBlocks(source, target);

            // The paragraph and the anchored item are safe; the plain items are a guess.
            expect(pairs).toEqual([
                [0, 0],
                [4, 3],
            ]);
        });

        it('should pair blocks whose unit counts differ when the structure around them agrees', () => {
            const source = blocksOf(['[[One.]] [[Two.]]', '', '- [[Item]]']);
            const target = blocksOf(['[[Одно и два.]]', '', '- [[Пункт]]']);

            expect(alignBlocks(source, target)).toEqual([
                [0, 0],
                [1, 1],
            ]);
        });

        it('should recover a moved section by its anchors and carry its plain items along', () => {
            const source = blocksOf([
                '# [[Releases]]',
                '',
                ...section('2.9.3', ['Fixed hangs', 'Other fixes']),
                ...section('2.10.0', ['Scala 2.13', 'Streaming', 'Dropped Java 11']),
            ]);
            const target = blocksOf([
                '# [[Релизы]]',
                '',
                ...section('2.10.0', ['Scala 2.13', 'Стриминг', 'Java 11 больше нет']),
                ...section('2.9.3', ['Исправлены зависания', 'Прочие исправления']),
            ]);

            const pairs = new Map(alignBlocks(source, target));

            expect(pairs.size).toBe(source.length);
            // 2.9.3 in the source is blocks 1..6, in the target 8..13.
            for (let i = 1; i <= 6; i++) {
                expect(pairs.get(i)).toBe(i + 7);
            }
            // 2.10.0 in the source is blocks 7..13, in the target 1..7.
            for (let i = 7; i <= 13; i++) {
                expect(pairs.get(i)).toBe(i - 6);
            }
        });

        it('should pair blocks with different anchors as substitutions, leaving the check to units', () => {
            const source = blocksOf(['{% cut "**[[2.11.1]]**" %}', '', '[[Summary.]]']);
            const target = blocksOf(['{% cut "**[[2.11.0]]**" %}', '', '[[Сводка.]]']);

            expect(alignBlocks(source, target)).toEqual([
                [0, 0],
                [1, 1],
            ]);
        });
    });
});

describe('translate seed links and prose', () => {
    const EN_RU = ['en', 'ru'];

    describe('linkRelation', () => {
        it.each([
            ['https://example.com/docs/en/gpu', 'https://example.com/docs/ru/gpu'],
            [
                'https://example.com/docs/api/changes/check.html',
                'https://example.org/docs/api/changes/check.html',
            ],
            ['../ru/concepts/page.md#section', '../en/concepts/page.md#section'],
            ['/en/search?q=dogs', '/ru/search?q=dogs'],
            [
                'https://example.com/repo/blob/main/src/examples/sample/main.cpp',
                '{{source-root}}/src/examples/sample/main.cpp',
            ],
        ])('should take %j and %j for the same page', (a, b) => {
            expect(linkRelation(a, b, EN_RU)).toBe('same');
            expect(linkRelation(b, a, EN_RU)).toBe('same');
        });

        it.each([
            [
                'https://example.com/docs/api/v5/changes/check.html',
                'https://example.org/docs/api/changes/check.html',
            ],
            ['//example.com/docs/api/v5/check.html', 'https://example.org/docs/api/check.html'],
        ])(
            'should take source %j and translation %j for the page under another section of another site',
            (source, target) => {
                expect(linkRelation(source, target, EN_RU)).toBe('nested');
                // A section the translation has on top of the source is an
                // address the source has just changed.
                expect(linkRelation(target, source, EN_RU)).toBe('other');
            },
        );

        it.each([
            // Another site under another name is not a translation of the page.
            [
                'https://github.com/org/repo/docs/page.md',
                'https://gitlab.com/org/repo/docs/page.md',
            ],
            // A variable matches only the literal segments around it.
            ['{{root}}/admin/install.md', '{{root}}/install.md'],
            ['{{admin-root}}/install.md', '{{user-root}}/install.md'],
            // A variable for the whole address or its end says nothing of the page.
            ['{{link-console-main}}', 'https://example.com/billing/accounts'],
            ['{{link-console-main}}', 'https://github.com'],
            ['{{root}}/en', 'https://any.example.net/ru'],
            ['{{link}}#setup', 'https://other.example.net/#setup'],
            ['/docs/{{page}}', '/docs/admin/upgrade.md'],
            // Other sites: subdomains, shared suffixes, addresses and ports.
            ['https://console.example.com/', 'https://example.com/'],
            ['https://docs.example.com/install.html', 'https://blog.example.com/install.html'],
            [
                'https://alice.github.io/tool/install.html',
                'https://bob.github.io/tool/install.html',
            ],
            ['https://shop.co.uk/docs/install.html', 'https://other.co.uk/docs/install.html'],
            ['http://10.0.0.1/admin', 'http://192.168.0.1/admin'],
            ['http://localhost:8080/api', 'http://localhost:9090/api'],
            ['/docs/admin/install.md', '/guide/{{lang}}/install.md'],
            ['/docs/admin/install.md', '{{root}}/user/install.md'],
        ])('should tell source %j from translation %j', (source, target) => {
            expect(linkRelation(source, target, EN_RU)).toBe('other');
            expect(linkRelation(target, source, EN_RU)).toBe('other');
        });

        it.each([
            ['{{root}}/src/main.cpp', '{{root}}/src/main.cpp'],
            ['https://example.com/repo/blob/main/src/main.cpp', '{{source-root}}/src/main.cpp'],
            ['/docs/admin/install.md', '/docs/{{section}}/install.md'],
            ['https://docs.example.com/docs/page.md', 'https://docs.example.ru/docs/page.md'],
            ['https://en.example.org/wiki/MD5', 'https://ru.example.org/wiki/MD5'],
            ['https://example.com:443/docs/x.md', 'https://example.com/docs/x.md'],
            ['https://example.com/docs/{{lang}}/', 'https://example.com/docs/ru/'],
        ])('should take source %j and translation %j for the same page', (source, target) => {
            expect(linkRelation(source, target, EN_RU)).toBe('same');
        });

        it.each([
            ['/en/admin/install.md', '/ru/user/install.md'],
            ['/en/docs/install.md', '/ru/docs/admin/install.md'],
            [
                'https://example.com/en/docs/install.md',
                'https://example.com/ru/docs/admin/install.md',
            ],
            // The same site whatever the scheme, port, `www.` and case of the host.
            [
                'http://example.com/en/docs/install.md',
                'https://example.com/ru/docs/admin/install.md',
            ],
            [
                'https://www.example.com/en/docs/install.md',
                'https://example.com/ru/docs/admin/install.md',
            ],
            [
                'https://example.com:8443/en/docs/install.md',
                'https://EXAMPLE.com/ru/docs/admin/install.md',
            ],
            ['//example.com/en/docs/install.md', 'https://example.com/ru/docs/admin/install.md'],
            ['/en/search?q=dogs', '/ru/search?q=cats'],
            ['pragmas.md#yt.FileCacheTtl', 'pragmas.md#yt.TableContentTmpFolder'],
            ['https://x.y/ui/page.html', 'https://x.y/ui/other.html'],
        ])('should tell %j from %j', (a, b) => {
            expect(linkRelation(a, b, EN_RU)).toBe('other');
        });

        it('should compare links as they are without languages', () => {
            expect(linkRelation('/en/gpu', '/ru/gpu', [])).toBe('other');
            expect(linkRelation('/en/gpu', '/en/gpu', [])).toBe('same');
        });
    });

    describe('unitProse', () => {
        const OPEN = '<x ctype="code_open" equiv-text="`" id="x-1"/>';
        const CLOSE = '<x ctype="code_close" equiv-text="`" id="x-2"/>';

        it.each([
            [`Call ${OPEN}get_user${CLOSE} here`, 'Call  here'],
            [`get_user${CLOSE} starts it`, ' starts it'],
            [`It ends with ${OPEN}get_user`, 'It ends with '],
            ['No code &amp; entity', 'No code   entity'],
        ])('should drop code spans of %j', (text, prose) => {
            expect(unitProse(unit(text))).toBe(prose);
        });
    });
});
