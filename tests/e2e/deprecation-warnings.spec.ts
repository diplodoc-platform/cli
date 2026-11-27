import {mkdir, mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {execa} from 'execa';
import {afterAll, beforeAll, expect, it} from 'vitest';

const binary = process.env.DIPLODOC_BINARY_PATH || resolve(__dirname, '../../build/index.js');
let root: string;

beforeAll(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'diplodoc-deprecation-policy-')));
});

afterAll(async () => {
    await rm(root, {recursive: true, force: true});
});

const cases = [
    {name: 'default', flags: ['-j1'], show: true, code: 0},
    {name: 'worker', flags: ['-j2'], show: true, code: 0},
    {name: 'muted', flags: ['--no-deprecation-warnings', '-j2'], show: false, code: 0},
    {name: 'config', flags: ['-j1'], yaml: true, show: false, code: 0},
    {name: 'override', flags: ['--deprecation-warnings', '-j2'], yaml: true, show: true, code: 0},
    {name: 'mixed', flags: ['-j2'], link: '#absent', diagnostic: 'YFM025', show: true, code: 1},
    {
        name: 'warn',
        flags: ['--no-deprecation-warnings', '-j2'],
        link: '#absent',
        diagnostic: 'YFM025',
        show: false,
        code: 1,
    },
    {
        name: 'error',
        flags: ['--no-deprecation-warnings', '-j1'],
        link: 'missing.md',
        diagnostic: 'YFM003',
        show: false,
        code: 1,
    },
];

it.each(cases)('handles deprecations in a strict $name build', async (fixture) => {
    const input = join(root, fixture.name);
    const output = input + '-html';
    await mkdir(input);
    await writeFile(
        join(input, 'toc.yaml'),
        'title: Example\nitems:\n  - name: Example\n    href: index.md\n',
    );
    // SVG already exists; only the legacy dimension is deprecated.
    await writeFile(join(input, 'image.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await writeFile(
        join(input, 'index.md'),
        '# Example\n\n![Example](image.svg =20x30)\n' +
            (fixture.link ? '\n[Example](' + fixture.link + ')\n' : ''),
    );
    if (fixture.yaml) {
        await writeFile(join(input, '.yfm'), 'deprecationWarnings: false\n');
    }
    const result = await execa(
        binary,
        ['build', '-i', input, '-o', output, '--no-vcs', '--strict', ...fixture.flags],
        {reject: false},
    );
    const logs = result.stdout + result.stderr;
    expect(result.exitCode, logs).toBe(fixture.code);
    expect(logs.includes('IMAGE_SIZE_LEGACY_SYNTAX')).toBe(fixture.show);
    if (fixture.diagnostic) {
        expect(logs).toContain(fixture.diagnostic);
    }
    expect(await readFile(join(output, 'index.html'), 'utf8')).toContain('diplodoc-state');
});
