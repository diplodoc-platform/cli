import type {RunSpy} from '~/commands/build/__tests__';
import type {RawToc} from './types';
import type {TocServiceConfig} from './TocService';
import type {Preset} from '~/core/vars';

import {join} from 'node:path';
import {describe, expect, it, vi} from 'vitest';
import {when} from 'vitest-when';
import {dedent} from 'ts-dedent';

import {setupRun} from '~/commands/build/__tests__';
import {normalizePath} from '~/core/utils';

import {TocService} from './TocService';
import {getHooks} from './hooks';

type Options = DeepPartial<TocServiceConfig>;

vi.mock('../vars/VarsService');

function setupService(options: Options = {}) {
    const run = setupRun({
        ignoreStage: [],
        removeHiddenTocItems: false,
        ...options,
        template: {
            enabled: true,
            ...(options.template || {}),
            features: {
                conditions: true,
                substitutions: true,
                ...((options.template || {}).features || {}),
            },
        },
    });
    const toc = new TocService(run);

    return {run, toc};
}

function mockData(run: RunSpy, content: string, vars: Preset, files: Files, copy: Copy) {
    when(run.vars.for)
        .calledWith('toc.yaml' as NormalizedPath)
        .thenReturn(vars);

    when(run.read)
        .calledWith(normalizePath(join(run.input, './toc.yaml')) as AbsolutePath)
        .thenResolve(content);

    for (const [path, content] of Object.entries(files)) {
        when(run.read)
            .calledWith(normalizePath(join(run.input, path)) as AbsolutePath)
            .thenResolve(content as string);
    }

    for (const [from, to] of copy) {
        when(run.copy)
            .calledWith(
                normalizePath(join(run.input, from)) as AbsolutePath,
                normalizePath(join(run.input, to)) as AbsolutePath,
                expect.anything(),
            )
            .thenResolve([]);
    }
}

type Files = Hash<string>;
type Copy = [RelativePath, RelativePath][];
function test(
    content: string,
    options: Options = {},
    vars: Preset = {},
    files: Files = {},
    copy: Copy = [],
) {
    return async () => {
        const {run, toc} = setupService(options);

        mockData(run, content, vars, files, copy);

        await toc.init(['toc.yaml'] as NormalizedPath[]);

        const vfile = await toc.dump('toc.yaml' as NormalizedPath);

        expect(vfile.toString()).toMatchSnapshot();
    };
}

describe('toc-loader', () => {
    it(
        'should handle simple title',
        test(dedent`
            title: Title
        `),
    );

    it(
        'should handle filter title',
        test(
            dedent`
                title:
                  - text: Title A
                    when: var == "A"
                  - text: Title B
                    when: var == "B"
            `,
            {},
            {var: 'B'},
        ),
    );

    it('should interpolate title', test(`title: Title {{var}}`, {}, {var: 'C'}));

    it(
        'should interpolate conditions in title',
        test(
            dedent`
                title: Title {% if var == "C"%} IF {% endif %}
            `,
            {},
            {var: 'C'},
        ),
    );

    it(
        'should interpolate filter title',
        test(
            dedent`
                title:
                  - text: Title A
                    when: var == "A"
                  - text: Title B
                    when: var == "B"
                  - text: Title {{var}}
                    when: var == "C"
            `,
            {},
            {var: 'C'},
        ),
    );

    it(
        'should not interpolate title if substitutions is disabled',
        test(
            dedent`
                title: Title {{var}}
            `,
            {template: {features: {substitutions: false}}},
            {var: 'C'},
        ),
    );

    it(
        'should not interpolate title if conditions is disabled',
        test(
            dedent`
                title: Title {% if var == "C"%} IF {% endif %}
            `,
            {template: {features: {conditions: false}}},
            {var: 'C'},
        ),
    );

    it(
        'should not interpolate title if both templating is disabled',
        test(
            dedent`
                title: Title {% if var == "C"%} IF {% endif %}
            `,
            {template: {features: {conditions: false, substitutions: false}}},
            {var: 'C'},
        ),
    );

    it(
        'should not filter item with accepted rule',
        test(
            dedent`
                items:
                  - name: Visible Item 1
                  - name: Visible Item {{name}}
                    when: stage == 'test'
                  - name: Visible Item 3
            `,
            {},
            {stage: 'test', name: 2},
        ),
    );

    it(
        'should filter item with declined rule',
        test(
            dedent`
                items:
                  - name: Visible Item 1
                  - name: Item {{name}}
                    when: stage == 'test'
                  - name: Visible Item 2
            `,
            {},
            {stage: 'dev'},
        ),
    );

    it(
        'should filter hidden item',
        test(
            dedent`
                items:
                  - name: Visible Item 1
                  - name: Hidden Item {{name}}
                    hidden: true
                    when: stage == 'test'
                  - name: Visible Item 2
                    when: stage == 'test'
            `,
            {removeHiddenTocItems: true},
            {stage: 'test'},
        ),
    );

    it(
        'should remove empty items (no children and no href)',
        test(
            dedent`
                items:
                  - name: Item with href
                    href: page.md
                  - name: Empty item
                  - name: Item with children
                    items:
                      - name: Child item
                        href: child.md
                  - name: Another empty item
            `,
            {removeEmptyTocItems: true},
            {},
        ),
    );

    it(
        'should interpolate item name',
        test(
            dedent`
                items:
                  - name: Item {{name}}
            `,
            {},
            {name: 'C'},
        ),
    );

    it(
        'should interpolate item href',
        test(
            dedent`
                items:
                  - href: "{{file}}"
            `,
            {},
            {file: './file.md'},
        ),
    );

    it(
        'should interpolate nested item',
        test(
            dedent`
                items:
                  - name: Parent
                    items:
                      - name: Item {{name}}
                        href: "{{file}}"
            `,
            {},
            {name: 'C', file: './file.md'},
        ),
    );

    it(
        'should normalize items',
        test(
            dedent`
                items:
                  - name: Item without extension
                    href: some/href
                  - name: Item with slash
                    href: some/href/
            `,
            {},
            {},
        ),
    );

    it(
        'should load restricted-access as string',
        test(
            dedent`
                name: root
                restricted-access: admin
                items:
                  - name: Item without access
                    href: some/href.md
            `,
            {},
            {},
        ),
    );
    it(
        'should load restricted-access as array',
        test(
            dedent`
                name: root
                restricted-access:
                  - admin
                  - user
                items:
                  - name: Item without access
                    href: some/href.md
            `,
            {},
            {},
        ),
    );
    it(
        'should load restricted-access as array on two level',
        test(
            dedent`
                name: root
                restricted-access:
                  - admin
                  - user
                items:
                  - name: Item without access
                    restricted-access:
                      - userA
                      - userB
                    href: some/href.md
            `,
            {},
            {},
        ),
    );

    describe('includes', () => {
        it(
            'should rebase items href for includes in link mode',
            test(
                dedent`
                    items:
                      - name: Outer Item
                        include:
                          path: _includes/core/i-toc.yaml
                          mode: link
                `,
                {},
                {},
                {
                    '_includes/core/i-toc.yaml': dedent`
                        items:
                          - name: Inner Item 1
                            href: item-1.md
                            items:
                              - name: Inner Sub Item 1
                                href: sub-item-1.md
                          - name: Inner Item 2
                            href: ./item-2.md
                          - name: Inner Item 3
                            href: ./sub/item-3.md
                          - name: Inner Item 4
                            href: sub/item-4.md
                          - name: Inner Item 5
                            href: ../item-5.md
                          - name: Inner Item 6
                            href: https://example.com
                          - name: Inner Item 7
                            href: //example.com
                    `,
                },
            ),
        );

        it(
            'should merge includes in link mode',
            test(
                dedent`
                    items:
                      - name: Outer Item
                        include:
                          path: _includes/core/i-toc.yaml
                          mode: link
                `,
                {},
                {},
                {
                    '_includes/core/i-toc.yaml': dedent`
                        items:
                          - name: Inner Item 1
                    `,
                },
            ),
        );

        it(
            'should merge includes in flat link mode',
            test(
                dedent`
                    items:
                      - include:
                          path: _includes/core/i-toc.yaml
                          mode: link
                `,
                {},
                {},
                {
                    '_includes/core/i-toc.yaml': dedent`
                        items:
                          - name: Inner Item 1
                    `,
                },
            ),
        );

        it(
            'should merge deep includes in link mode',
            test(
                dedent`
                    items:
                      - name: Outer Item
                        include:
                            path: _includes/core/i-toc.yaml
                            mode: link
                `,
                {},
                {},
                {
                    '_includes/core/i-toc.yaml': dedent`
                        items:
                          - name: Inner Item 1
                            href: item-1.md
                          - name: Inner Item 2
                            include:
                              path: ../lib/i-toc.yaml
                              mode: link
                    `,
                    '_includes/lib/i-toc.yaml': dedent`
                        items:
                          - name: Inner Lib Item 1
                            href: item-1.md
                    `,
                },
            ),
        );

        it(
            'should merge deep includes in merge mode',
            test(
                dedent`
                    items:
                      - name: Outer Item
                        include:
                            path: _includes/core/toc.yaml
                            mode: link
                `,
                {},
                {},
                {
                    '_includes/core/toc.yaml': dedent`
                        items:
                          - name: Inner Item 1
                            href: item-1.md
                          - name: Inner Item 2
                            include:
                              path: ../merge/i-toc.yaml
                              mode: merge
                    `,
                    '_includes/core/sub/toc.yaml': dedent`
                        items:
                          - name: Inner Sub Item 1
                            href: sub-item-1.md
                    `,
                    '_includes/merge/i-toc.yaml': dedent`
                        items:
                          - name: Inner Merge Item 1
                            href: merge-item-1.md
                          - include:
                              path: ../deep-merge/i-toc.yaml
                              mode: merge
                          - include:
                              path: ./sub/toc.yaml
                              mode: merge
                    `,
                    '_includes/deep-merge/i-toc.yaml': dedent`
                        items:
                          - name: Inner Deep Merge Item 1
                            href: deep-merge-item-1.md
                    `,
                },
                [
                    ['_includes/merge', '_includes/core'],
                    ['_includes/deep-merge', '_includes/core'],
                    ['_includes/core/sub', '_includes/core'],
                ] as [RelativePath, RelativePath][],
            ),
        );
    });

    describe('includers', () => {
        it('should throw on unregistered includer', async () => {
            await expect(
                test(
                    dedent`
                    items:
                      - name: Common item
                      - include:
                          path: _includes/core/i-toc.yaml
                          mode: link
                          includers:
                            - name: unknown
                `,
                    {},
                    {},
                    {
                        '_includes/core/i-toc.yaml': dedent`
                        items:
                          - name: Inner Item 1
                    `,
                    },
                ),
            ).rejects.toThrow(`Includer with name 'unknown' is not registered.`);
        });

        it('should handle registered includer', async () => {
            const {run, toc} = setupService({});
            const content = dedent`
                items:
                  - name: Common item
                  - include:
                      path: _includes/core/i-toc.yaml
                      mode: link
                      includers:
                        - name: expected
            `;
            const files = {
                '_includes/core/i-toc.yaml': dedent`
                    items:
                      - name: Inner Item 1
                `,
            };

            mockData(run, content, {}, files, []);

            getHooks(toc)
                .Includer.for('expected')
                .tap('Tests', (toc) => ({
                    ...toc,
                    stage: 'test',
                }));

            await toc.init(['toc.yaml'] as NormalizedPath[]);

            const vfile = await toc.dump('toc.yaml' as NormalizedPath);

            expect(vfile.toString()).toMatchSnapshot();
        });

        it('should fix include path', async () => {
            expect.assertions(2);

            const {run, toc} = setupService({});
            const content = dedent`
                items:
                  - name: Common item
                  - include:
                      path: _includes/core
                      mode: link
                      includers:
                        - name: expected
            `;
            const files = {};

            mockData(run, content, {}, files, []);

            getHooks(toc)
                .Includer.for('expected')
                .tap('Tests', (toc, options) => {
                    expect(options).toMatchObject({
                        path: '_includes/core/toc.yaml',
                    });

                    return {
                        ...toc,
                        stage: 'test',
                    };
                });

            await toc.init(['toc.yaml'] as NormalizedPath[]);

            const vfile = await toc.dump('toc.yaml' as NormalizedPath);

            expect(vfile.toString()).toMatchSnapshot();
        });

        it('should pass extra params to includer', async () => {
            expect.assertions(2);

            const {run, toc} = setupService({});
            const content = dedent`
                items:
                  - name: Common item
                  - include:
                      path: _includes/core
                      mode: link
                      includers:
                        - name: expected
                          field: value
            `;
            const files = {};

            mockData(run, content, {}, files, []);

            getHooks(toc)
                .Includer.for('expected')
                .tap('Tests', (toc, options) => {
                    expect(options).toMatchObject({
                        path: '_includes/core/toc.yaml',
                        field: 'value',
                    });

                    return {
                        ...toc,
                        stage: 'test',
                    };
                });

            await toc.init(['toc.yaml'] as NormalizedPath[]);

            const vfile = await toc.dump('toc.yaml' as NormalizedPath);

            expect(vfile.toString()).toMatchSnapshot();
        });

        it('should merge includer toc to parent', async () => {
            const {run, toc} = setupService({});
            const content = dedent`
                items:
                  - name: Common item
                  - include:
                      path: _includes/core
                      mode: link
                      includers:
                        - name: expected
                          field: value
            `;
            const files = {};

            mockData(run, content, {}, files, []);

            getHooks(toc)
                .Includer.for('expected')
                .tap('Tests', (toc) => {
                    return {
                        ...toc,
                        stage: 'test',
                        items: [{name: 'Includer item 1'}],
                    } as RawToc;
                });

            await toc.init(['toc.yaml'] as NormalizedPath[]);

            const vfile = await toc.dump('toc.yaml' as NormalizedPath);

            expect(vfile.toString()).toMatchSnapshot();
        });
    });
});
