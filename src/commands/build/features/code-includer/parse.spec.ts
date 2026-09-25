import {describe, expect, it} from 'vitest';

import {parseCodeDirective} from './parse';

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
