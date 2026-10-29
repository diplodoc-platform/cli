import {
    chmod,
    mkdir,
    mkdtemp,
    readFile,
    realpath,
    rm,
    stat,
    utimes,
    writeFile,
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {delimiter, join} from 'node:path';
import {describe, expect, test} from 'vitest';

import {TestAdapter} from '../fixtures';

const DATE = '2025-01-02T03:04:05.000Z';
const FILE_DATE = '2020-06-07T08:09:10.000Z';

type BuildCase = [
    settings: string | null,
    internal: boolean,
    date: string | undefined,
    args?: string[],
];

const cases: BuildCase[] = [
    [null, true, DATE, ['--vcs-scopes', 'shared/docs']],
    ['', true, DATE],
    ['mtimes: false\n', true, undefined],
    ['mtimes: {enabled: false}\n', true, undefined],
    ['vcs: false\nmtimes: false\n', true, undefined],
    ['', false, undefined],
    ['build:\n  vcs: {scopes: [shared/docs]}\n', true, DATE],
    ['vcs: {enabled: false}\n', true, FILE_DATE],
    ['vcs: false\n', true, FILE_DATE],
    ['docs-viewer: {is-external: true}\n', true, undefined],
    ['docs-viewer: {is-new-external: true}\n', true, undefined],
    ['docs-viewer: {is-external: true}\nbuild:\n  docs-viewer: {}\n', true, undefined],
    ['docs-viewer: {is-new-external: true}\nbuild:\n  docs-viewer: {}\n', true, undefined],
    ['defaults: &defaults {mtimes: false}\n<<: *defaults\n', true, undefined],
    ['docs-viewer: {is-external: true}\nbuild:\n  vcs: {scopes: [shared/docs]}\n', true, undefined],
    [
        'docs-viewer: {is-new-external: true}\nbuild:\n  vcs: {scopes: [shared/docs]}\n',
        true,
        undefined,
    ],
    ['vcs: {enabled: false, scopes: [shared/docs]}\n', true, DATE, ['--vcs']],
    ['vcs: {scopes: [shared/docs]}\n', true, DATE, ['--vcs']],
    ['vcs: false\n', true, DATE, ['--vcs', '--vcs-scopes', 'shared/docs']],
    ['vcs: {scopes: [shared/docs]}\n', true, FILE_DATE, ['--no-vcs']],
    [
        'extensions: [./root.cjs]\nbuild:\n  extensions: []\n',
        true,
        DATE,
        ['--vcs-scopes', 'shared/docs'],
    ],
    [
        'extensions: [./root.cjs]\nbuild:\n  extensions: [./build.cjs]\n',
        true,
        DATE,
        ['--vcs-scopes', 'shared/docs'],
    ],
    [
        'extensions: [{name: ./root.cjs, marker: root}]\nbuild:\n  extensions: [{name: ./root.cjs, marker: build}]\n',
        true,
        DATE,
        ['--vcs-scopes', 'shared/docs'],
    ],
];

describe.skipIf(process.platform === 'win32')('internal build mode', () => {
    test.each(cases)(
        'builds with settings %j and internal=%s',
        async (settings, internal, date, args = []) => {
            const dir = await realpath(await mkdtemp(join(tmpdir(), 'internal-build-')));
            const input = join(dir, 'input');
            const output = join(dir, 'output');
            const config = settings === null ? join(input, '.yfm') : join(dir, 'effective.yaml');
            const source = `# Keep this source unchanged\n${settings ?? ''}`;

            try {
                await mkdir(join(input, 'copied'), {recursive: true});
                await writeFile(join(input, 'toc.yaml'), 'title: Test\nhref: copied/article.md\n');
                await writeFile(
                    join(input, 'copied/article.md'),
                    '---\nvcsPath: shared/docs/article.md\n---\n# Copied article\n',
                );
                if (settings?.includes('./root.cjs')) {
                    for (const name of ['root', 'build']) {
                        await writeFile(
                            join(dir, `${name}.cjs`),
                            [
                                'const fs = require("node:fs");',
                                'module.exports.Extension = class {',
                                'constructor(options) { this.options = options; }',
                                'apply(program) {',
                                `fs.writeFileSync(${JSON.stringify(join(dir, `${name}.loaded`))}, 'loaded');`,
                                `fs.appendFileSync(${JSON.stringify(join(dir, `${name}.calls`))}, JSON.stringify({command: program.command.name(), marker: this.options.marker}) + '\\n');`,
                                '}',
                                '};',
                            ].join('\n'),
                        );
                    }
                }
                await utimes(
                    join(input, 'copied/article.md'),
                    new Date(FILE_DATE),
                    new Date(FILE_DATE),
                );
                // The effective config is outside the input, as with DOCS_CONFIG.
                const scopes = settings?.includes('vcs:') ? '' : 'vcs: {scopes: [shared/docs]}\n';
                if (settings !== null) {
                    await writeFile(config, source + scopes);
                    await chmod(config, 0o444);
                }
                const before = settings === null ? undefined : await stat(config);
                const arc = join(dir, 'arc');
                await writeFile(
                    arc,
                    [
                        `#!${process.execPath}`,
                        'const fs = require("node:fs");',
                        'const args = process.argv.slice(2);',
                        `fs.appendFileSync(${JSON.stringify(join(dir, 'arc-calls'))}, JSON.stringify({args, cwd: process.cwd()}) + '\\n');`,
                        `if (args[0] === 'root') console.log(${JSON.stringify(dir)});`,
                        `else if (args.includes('shared/docs')) console.log('commit abcdef\\nauthor: tester\\ndate: ${DATE}\\n\\n    Update original\\n\\nM shared/docs/article.md');`,
                        '',
                    ].join('\n'),
                );
                await chmod(arc, 0o755);

                const report = await TestAdapter.runner.runRaw(
                    [
                        '-i',
                        input,
                        '-o',
                        output,
                        ...(settings === null ? [] : ['-c', config]),
                        '-f',
                        'md',
                        ...(internal ? ['--internal-build'] : []),
                        ...args,
                    ],
                    {PATH: `${dir}${delimiter}${process.env.PATH}`},
                );

                expect(report.code, report.stderr).toBe(0);
                const article = await readFile(join(output, 'copied/article.md'), 'utf8');
                if (settings?.includes('./root.cjs')) {
                    expect(await readFile(join(dir, 'root.loaded'), 'utf8')).toBe('loaded');
                }
                if (settings?.includes('./build.cjs')) {
                    expect(await readFile(join(dir, 'build.loaded'), 'utf8')).toBe('loaded');
                }
                if (settings?.includes('marker: build')) {
                    const calls = (await readFile(join(dir, 'root.calls'), 'utf8'))
                        .trim()
                        .split('\n')
                        .map((call) => JSON.parse(call));
                    expect(calls.filter(({command}) => command === 'build')).toEqual([
                        {command: 'build', marker: 'build'},
                    ]);
                }
                if (date) {
                    expect(article).toContain(`updatedAt: '${date}'`);
                } else {
                    expect(article).not.toContain('updatedAt:');
                }
                if (date === DATE) {
                    expect(await readFile(join(dir, 'arc-calls'), 'utf8')).toContain('shared/docs');
                }
                if (before) {
                    expect(await readFile(config, 'utf8')).toBe(source + scopes);
                    expect((await stat(config)).mtimeMs).toBe(before.mtimeMs);
                } else {
                    await expect(stat(config)).rejects.toMatchObject({code: 'ENOENT'});
                    const [firstCall] = (await readFile(join(dir, 'arc-calls'), 'utf8')).split(
                        '\n',
                    );
                    expect(JSON.parse(firstCall).cwd).toBe(input);
                }
            } finally {
                await rm(dir, {recursive: true, force: true});
            }
        },
    );
});
