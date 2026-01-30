import type {RunSpy} from '~/commands/build/__tests__';
import type {BuildConfig} from '~/commands/build/types';
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
        } as BuildConfig['template'],
    });
    const toc = new TocService(run, {});

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

    describe('navigation header items filtering', () => {
        it(
            'should filter navigation header leftItems by when condition',
            test(
                dedent`
                    title: Test
                    navigation:
                      header:
                        leftItems:
                          - text: Always visible
                            type: link
                            url: ./index.md
                          - text: Visible when true
                            type: link
                            url: ./page1.md
                            when: stage == 'test'
                          - text: Hidden when false
                            type: link
                            url: ./page2.md
                            when: stage == 'dev'
                `,
                {},
                {stage: 'test'},
            ),
        );

        it(
            'should filter navigation header rightItems by when condition',
            test(
                dedent`
                    title: Test
                    navigation:
                      header:
                        rightItems:
                          - type: controls
                          - text: Hidden control
                            type: link
                            url: ./hidden.md
                            when: false
                `,
                {},
                {},
            ),
        );

        it(
            'should filter both leftItems and rightItems',
            test(
                dedent`
                    title: Test
                    navigation:
                      logo:
                        url: ./
                      header:
                        leftItems:
                          - text: Visible
                            type: link
                            url: ./visible.md
                          - text: Hidden
                            type: link
                            url: ./hidden.md
                            when: var1 > 10
                        rightItems:
                          - type: controls
                          - text: Visible
                            type: link
                            url: ./visible2.md
                            when: var1 == 5
                `,
                {},
                {var1: 5},
            ),
        );

        it(
            'should not filter navigation when conditions feature is disabled',
            test(
                dedent`
                    title: Test
                    navigation:
                      header:
                        leftItems:
                          - text: Should remain
                            type: link
                            url: ./page.md
                            when: false
                `,
                {template: {features: {conditions: false}}},
                {},
            ),
        );

        it(
            'should handle navigation without header',
            test(
                dedent`
                    title: Test
                    navigation:
                      logo:
                        url: ./
                `,
                {},
                {},
            ),
        );

        it(
            'should interpolate text in leftItems',
            test(
                dedent`
                    title: Test
                    navigation:
                      header:
                        leftItems:
                          - text: Hello {{name}}
                            type: link
                            url: ./index.md
                `,
                {},
                {name: 'World'},
            ),
        );

        it(
            'should interpolate text in rightItems',
            test(
                dedent`
                    title: Test
                    navigation:
                      header:
                        rightItems:
                          - text: Welcome {{user}}
                            type: link
                            url: ./profile.md
                `,
                {},
                {user: 'Admin'},
            ),
        );

        it(
            'should interpolate url in navigation items',
            test(
                dedent`
                    title: Test
                    navigation:
                      header:
                        leftItems:
                          - text: Page
                            type: link
                            url: ./{{page}}.md
                `,
                {},
                {page: 'index'},
            ),
        );

        it(
            'should not interpolate navigation items when substitutions is disabled',
            test(
                dedent`
                    title: Test
                    navigation:
                      header:
                        leftItems:
                          - text: Hello {{name}}
                            type: link
                            url: ./index.md
                `,
                {template: {features: {substitutions: false}}},
                {name: 'World'},
            ),
        );

        it(
            'should interpolate both text and url in navigation items',
            test(
                dedent`
                    title: Test
                    navigation:
                      header:
                        leftItems:
                          - text: Go to {{page_name}}
                            type: link
                            url: ./{{page_path}}.md
                        rightItems:
                          - text: User {{user}}
                            type: link
                            url: ./{{user_path}}.md
                `,
                {},
                {page_name: 'Home', page_path: 'index', user: 'Admin', user_path: 'profile'},
            ),
        );

        it(
            'should interpolate urlTitle and icon in navigation items',
            test(
                dedent`
                    title: Test
                    navigation:
                      header:
                        leftItems:
                          - text: Button
                            type: button
                            url: ./index.md
                            urlTitle: Go to {{page_title}}
                            icon: https://example.com/{{icon_name}}.svg
                `,
                {},
                {page_title: 'Home Page', icon_name: 'home'},
            ),
        );

        it(
            'should interpolate nested items in dropdown',
            test(
                dedent`
                    title: Test
                    navigation:
                      header:
                        leftItems:
                          - text: Menu
                            type: dropdown
                            items:
                              - text: Option {{option_num}}
                                type: link
                                url: ./{{option_path}}.md
                `,
                {},
                {option_num: '1', option_path: 'option1'},
            ),
        );

        it(
            'should interpolate type field in navigation items',
            test(
                dedent`
                    title: Test
                    navigation:
                      header:
                        leftItems:
                          - text: Dynamic
                            type: "{{item_type}}"
                            url: ./index.md
                `,
                {},
                {item_type: 'link'},
            ),
        );
    });

    describe('object validation', () => {
        it('should not throw error when toc item name is [object Object] but log it', async () => {
            const content = dedent`
                items:
                  - name: {{some_var}}
                    href: page.md
            `;

            // Проверяем, что метод не выбрасывает исключение, а возвращает undefined
            const {run, toc} = setupService({});
            const files = {'toc.yaml': content};
            mockData(run, '', {}, files, []);

            const result = await toc.init(['toc.yaml'] as NormalizedPath[]);
            // При наличии ошибок в файле toc, метод init должен вернуть пустой массив
            expect(result).toMatchSnapshot();
        });

        it('should not throw error when toc item items is [object Object] but log it', async () => {
            const content = dedent`
                items:
                  - name: Parent
                    items: {{some_var}}
            `;

            // Проверяем, что метод не выбрасывает исключение, а возвращает undefined
            const {run, toc} = setupService({});
            const files = {'toc.yaml': content};
            mockData(run, '', {}, files, []);

            const result = await toc.init(['toc.yaml'] as NormalizedPath[]);
            // При наличии ошибок в файле toc, метод init должен вернуть пустой массив
            expect(result).toMatchSnapshot();
        });

        it('should not throw error when nested toc item has [object Object] values but log it', async () => {
            const content = dedent`
                items:
                  - name: Parent
                    items:
                      - name: {{some_var}}
                        href: page.md
            `;

            // Проверяем, что метод не выбрасывает исключение, а возвращает undefined
            const {run, toc} = setupService({});
            const files = {'toc.yaml': content};
            mockData(run, '', {}, files, []);

            const result = await toc.init(['toc.yaml'] as NormalizedPath[]);
            // При наличии ошибок в файле toc, метод init должен вернуть пустой массив
            expect(result).toMatchSnapshot();
        });

        it('should not throw error when other toc item property is [object Object]', async () => {
            const content = dedent`
                items:
                  - name: Valid Name
                    custom: {{some_var}}
                    href: page.md
            `;

            await expect(test(content)()).resolves.not.toThrow();
        });

        it('should not throw error when toc items are valid', async () => {
            const content = dedent`
                items:
                  - name: Valid Item
                    href: page.md
                  - name: Parent
                    items:
                      - name: Valid Child
                        href: child.md
            `;

            await expect(test(content)()).resolves.not.toThrow();
        });
    });

    describe('skipped tocs handling', () => {
        it('should not include skipped tocs in tocs getter', async () => {
            const {run, toc} = setupService({ignoreStage: ['skip']});

            // Mock valid toc file
            when(run.read).calledWith(
                normalizePath(join(run.input, './valid-toc.yaml')) as AbsolutePath,
            ).thenResolve(dedent`
                    title: Valid TOC
                    items:
                      - name: Item 1
                        href: page1.md
                `);

            // Mock skipped toc file
            when(run.read).calledWith(
                normalizePath(join(run.input, './skipped-toc.yaml')) as AbsolutePath,
            ).thenResolve(dedent`
                    title: Skipped TOC
                    stage: skip
                    items:
                      - name: Item 2
                        href: page2.md
                `);

            when(run.vars.for)
                .calledWith('valid-toc.yaml' as NormalizedPath)
                .thenReturn({});

            when(run.vars.for)
                .calledWith('skipped-toc.yaml' as NormalizedPath)
                .thenReturn({});

            // Initialize both files
            const result = await toc.init([
                'valid-toc.yaml',
                'skipped-toc.yaml',
            ] as NormalizedPath[]);

            // Check that only valid toc is returned
            expect(result).toHaveLength(1);
            expect(result[0].title).toBe('Valid TOC');

            // Check that tocs getter doesn't contain undefined
            const allTocs = toc.tocs;
            expect(allTocs.every((t) => t !== undefined)).toBe(true);
            expect(allTocs).toHaveLength(1);
        });

        it('should handle case when toc data is undefined', async () => {
            const {run, toc} = setupService({ignoreStage: ['skip']});

            // Mock skipped toc file
            when(run.read).calledWith(
                normalizePath(join(run.input, './skipped-toc.yaml')) as AbsolutePath,
            ).thenResolve(dedent`
                    title: Skipped TOC
                    stage: skip
                `);

            when(run.vars.for)
                .calledWith('skipped-toc.yaml' as NormalizedPath)
                .thenReturn({});

            // Initialize skipped file
            const result = await toc.init(['skipped-toc.yaml'] as NormalizedPath[]);

            // Should return empty array
            expect(result).toHaveLength(0);

            // tocs getter should also return empty array
            const allTocs = toc.tocs;
            expect(allTocs).toHaveLength(0);
        });

        it('should handle isToc method correctly for skipped files', async () => {
            const {run, toc} = setupService({ignoreStage: ['skip']});

            // Mock skipped toc file
            when(run.read).calledWith(
                normalizePath(join(run.input, './skipped-toc.yaml')) as AbsolutePath,
            ).thenResolve(dedent`
                    title: Skipped TOC
                    stage: skip
                `);

            when(run.vars.for)
                .calledWith('skipped-toc.yaml' as NormalizedPath)
                .thenReturn({});

            // Initialize skipped file
            await toc.init(['skipped-toc.yaml'] as NormalizedPath[]);

            // isToc should return falsy for skipped files with undefined data
            expect(toc.isToc('skipped-toc.yaml' as NormalizedPath)).toBeFalsy();
        });
    });
});
