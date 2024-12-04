import {join} from 'node:path';
import {describe, expect, it, vi} from 'vitest';
import {when} from 'vitest-when';
import {dedent} from 'ts-dedent';

import {TocService} from './TocService';

function test(content: string, options = {}, vars = {}, files = {}) {
    return async () => {
        const input = '/dev/null/input' as AbsolutePath;
        const output = '/dev/null/output' as AbsolutePath;
        const run = {
            input,
            output,
            config: {
                ignoreStage: options.ignoreStage || [],
                removeHiddenItems: Boolean(
                    'removeHiddenItems' in options ? options.removeHiddenItems : false,
                ),
                template: {
                    enabled: true,
                    features: {
                        conditions: Boolean(
                            'resolveConditions' in options ? options.resolveConditions : true,
                        ),
                        substitutions: Boolean(
                            'resolveSubstitutions' in options ? options.resolveSubstitutions : true,
                        ),
                    },
                },
            },
            vars: {
                load: vi.fn(),
            },
            fs: {
                readFile: vi.fn(),
            },
        };
        const toc = new TocService(run);

        when(run.vars.load).calledWith('./toc.yaml').thenResolve(vars);

        when(run.fs.readFile)
            .calledWith(join(input, './toc.yaml'), expect.anything())
            .thenResolve(content);

        for (const [path, content] of Object.entries(files)) {
            when(run.fs.readFile)
                .calledWith(join(input, path), expect.anything())
                .thenResolve(content);
        }

        const result = await toc.load('./toc.yaml' as RelativePath);

        expect(toc.dump(result)).toMatchSnapshot();
    };
}

describe.skip('toc-loader', () => {
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

    it(
        'should interpolate title',
        test(
            dedent`
        title: Title {{var}}
    `,
            {},
            {var: 'C'},
        ),
    );

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
        'should not interpolate title if templating is disabled',
        test(
            dedent`
        title: Title {{var}}
    `,
            {resolveConditions: false},
            {var: 'C'},
        ),
    );

    it(
        'should not interpolate title if substitutions is disabled',
        test(
            dedent`
        title: Title {{var}}
    `,
            {resolveSubstitutions: false},
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
            {removeHiddenItems: true},
            {stage: 'test'},
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
    });
});
