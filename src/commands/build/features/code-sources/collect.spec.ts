import type {Run} from '~/commands/build';
import type {LoaderContext} from '~/core/markdown/loader';
import type {ResolvedSource} from './sources';

import {describe, expect, it, vi} from 'vitest';

import {collect} from './collect';

const SOURCES: Hash<ResolvedSource> = {
    'go-sdk': {
        name: 'go-sdk',
        type: 'local',
        root: '/src/examples' as AbsolutePath,
        base: '/src' as AbsolutePath,
        prefix: 'examples',
        host: null,
        repo: null,
        url: null,
        ref: null,
        vendored: true,
        commit: null,
        raw: null,
        link: 'https://github.com/org/repo/blob/v1.0.0/{path}#{lines}',
    },
};

const CONNECT = [
    'package main',
    '',
    'func main() {',
    '\t// #region connect',
    '\tconnect()',
    '\t// #endregion connect',
    '}',
].join('\n');

function harness(files: Hash<string> = {'/src/examples/connect.go': CONNECT}) {
    const errors: string[] = [];
    const warns: string[] = [];

    const read = vi.fn(async (path: string) => {
        if (!(path in files)) {
            throw new Error(`ENOENT: no such file or directory, open '${path}'`);
        }

        return files[path];
    });

    const run = {read} as unknown as Run;

    const context = {
        path: 'index.md',
        logger: {
            error: (message: string) => errors.push(message),
            warn: (message: string) => warns.push(message),
        },
    } as unknown as LoaderContext;

    const plugin = collect(run, SOURCES);

    return {
        read,
        errors,
        warns,
        render: (content: string) => plugin.call(context, content),
    };
}

describe('collect', () => {
    it('should lower a directive to a fence with the inferred language', async () => {
        const {render} = harness();

        const result = await render('{% include-code [](go-sdk:connect.go#connect) %}');

        expect(result).toContain('```go\nconnect()\n```');
    });

    it('should append a permalink pinned to the configured ref', async () => {
        const {render} = harness();

        const result = await render('{% include-code [Connect](go-sdk:connect.go#connect) %}');

        expect(result).toContain(
            '[Connect](https://github.com/org/repo/blob/v1.0.0/examples/connect.go#L5)',
        );
    });

    it('should fall back to the target as the link caption', async () => {
        const {render} = harness();

        const result = await render('{% include-code [](go-sdk:connect.go#connect) %}');

        expect(result).toContain('[go-sdk:connect.go](https://github.com/org/repo/');
    });

    it('should suppress the link when asked', async () => {
        const {render} = harness();

        const result = await render('{% include-code [](go-sdk:connect.go#connect) link=false %}');

        expect(result).not.toContain('github.com');
    });

    it('should honour a language override', async () => {
        const {render} = harness({'/src/examples/a.txt': 'SELECT 1;'});

        const result = await render('{% include-code [](go-sdk:a.txt) lang=sql %}');

        expect(result).toContain('```sql');
    });

    it('should leave content around the directive untouched', async () => {
        const {render} = harness();

        const result = await render(
            'before\n\n{% include-code [](go-sdk:connect.go#connect) link=false %}\n\nafter',
        );

        expect(result.startsWith('before\n\n')).toBe(true);
        expect(result.endsWith('\n\nafter')).toBe(true);
    });

    it('should widen the fence when the snippet contains backticks', async () => {
        const {render} = harness({'/src/examples/a.md': 'text ``` more'});

        const result = await render('{% include-code [](go-sdk:a.md) link=false %}');

        expect(result).toContain('````markdown\ntext ``` more\n````');
    });

    it('should read a file once for several directives', async () => {
        const {render, read} = harness();

        await render(
            '{% include-code [](go-sdk:connect.go#connect) %}\n' +
                '{% include-code [](go-sdk:connect.go) %}',
        );

        expect(read).toHaveBeenCalledTimes(1);
    });

    it('should pass content without directives through untouched', async () => {
        const {render, read} = harness();
        const content = '# Title\n\nplain text';

        expect(await render(content)).toBe(content);
        expect(read).not.toHaveBeenCalled();
    });

    describe('failures', () => {
        it('should report an unknown source and emit an inert placeholder', async () => {
            const {render, errors} = harness();

            const result = await render('{% include-code [](nope:connect.go) %}');

            expect(errors[0]).toContain('Unknown code source');
            expect(result).toBe("<!-- include-code failed: unknown source 'nope' -->");
        });

        it('should never leave the directive in place, it would parse as a link', async () => {
            const {render} = harness();

            const result = await render('{% include-code [](go-sdk:missing.go) %}');

            expect(result).not.toContain('include-code [](');
            expect(result.startsWith('<!--')).toBe(true);
        });

        it('should keep filesystem paths out of the emitted placeholder', async () => {
            const {render, errors} = harness();

            const result = await render('{% include-code [](go-sdk:missing.go) %}');

            expect(result).toBe('<!-- include-code failed: go-sdk:missing.go -->');
            expect(result).not.toContain('/src/examples');
            // The full reason is still reported, just not published.
            expect(errors[0]).toContain('ENOENT');
        });

        it('should report a missing region', async () => {
            const {render, errors} = harness();

            await render('{% include-code [](go-sdk:connect.go#gone) %}');

            expect(errors[0]).toContain("region 'gone' not found");
        });

        it('should warn about line ranges but still resolve them', async () => {
            const {render, warns} = harness();

            const result = await render('{% include-code [](go-sdk:connect.go#L1-L1) %}');

            expect(warns[0]).toContain('Line ranges break');
            expect(result).toContain('package main');
        });

        it('should report a malformed directive', async () => {
            const {render, errors} = harness();

            const result = await render('{% include-code [](../escape.go) %}');

            expect(errors[0]).toContain('Invalid include-code directive');
            expect(result).toBe('<!-- include-code failed: invalid directive -->');
        });
    });
});
