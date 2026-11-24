import {describe, expect, it} from 'vitest';

import {parseCodeDirective, parseCodeTarget} from './parse';

describe('parseCodeDirective', () => {
    it('parses the public directive arguments', () => {
        expect(
            parseCodeDirective(
                `{% code "./examples/main.ts" lang='typescript' lines="[BEGIN example]-[END example]" keep-indents %}`,
            ),
        ).toEqual({
            passthrough: false,
            warnings: [],
            directive: {
                path: './examples/main.ts',
                lang: 'typescript',
                lines: '[BEGIN example]-[END example]',
                keepIndents: true,
            },
        });
    });

    it('supports multiple directives independently', () => {
        const directives = [`{% code './one.ts' %}`, `{% code "/two.ts" lang="ts" %}`].map(
            parseCodeDirective,
        );

        expect(directives).toMatchObject([
            {directive: {path: './one.ts', lang: '', keepIndents: false}},
            {directive: {path: '/two.ts', lang: 'ts', keepIndents: false}},
        ]);
    });

    it('passes jsonpath directives through without diagnostics', () => {
        expect(
            parseCodeDirective(`{% code './data.json' unsupported jsonpath='$.items' %}`),
        ).toEqual({passthrough: true});
    });

    it('reports a missing source path', () => {
        expect(parseCodeDirective(`{% code lang="ts" %}`)).toMatchObject({
            passthrough: false,
            error: 'source path is required',
        });
    });

    it.each([
        './example.ts#auth',
        './C#/Program.cs',
        './file#with spaces.ts',
        './file#',
        './C#/Program.cs#auth',
    ])('keeps the complete path until literal-file resolution: %s', (path) => {
        expect(parseCodeDirective(`{% code '${path}' %}`)).toMatchObject({
            directive: {path},
            warnings: [],
        });
    });

    it('preserves a literal hash path with the legacy selector', () => {
        expect(parseCodeDirective(`{% code './C#/Program.cs' lines='BEGIN-END' %}`)).toMatchObject({
            directive: {path: './C#/Program.cs', lines: 'BEGIN-END'},
            warnings: [],
        });
    });

    it.each(['', 'auth name', 'auth?x', 'авторизация'])(
        'rejects an invalid region name: %s',
        (region) => {
            expect(parseCodeTarget(`./example.ts#${region}`)).toMatchObject({
                error: expect.stringContaining('invalid region name'),
            });
        },
    );

    it('rejects combined region and legacy selectors, including an empty lines value', () => {
        for (const lines of ['A-B', '']) {
            expect(parseCodeTarget('./example.ts#auth', lines)).toMatchObject({
                error: 'a region and attribute "lines" cannot be combined',
            });
        }
    });

    it('still passes jsonpath through when the path contains a hash', () => {
        expect(parseCodeDirective(`{% code './data.json#literal' jsonpath='$.value' %}`)).toEqual({
            passthrough: true,
        });
    });

    it.each([`{% codec './example.ts' %}`, `{% code './example.ts'`])(
        'rejects invalid directive syntax: %s',
        (source) => {
            expect(parseCodeDirective(source)).toMatchObject({
                passthrough: false,
                error: 'invalid code directive syntax',
            });
        },
    );
});

describe('parseCodeTarget after a missing literal file', () => {
    it.each(['auth', 'auth-v2', 'sdk/auth.v2', '2-3'])('parses the region name %s', (region) => {
        expect(parseCodeTarget(`./example.ts#${region}`)).toEqual({path: './example.ts', region});
    });

    it('splits at the final hash so directory and file names can contain hashes', () => {
        expect(parseCodeTarget('./C#/Program#example.cs#auth')).toEqual({
            path: './C#/Program#example.cs',
            region: 'auth',
        });
    });
});
