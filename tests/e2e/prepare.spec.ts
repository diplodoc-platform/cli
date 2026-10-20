import {
    access,
    lstat,
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    readlink,
    realpath,
    rename,
    rm,
    symlink,
    utimes,
    writeFile,
} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {afterEach, beforeEach, describe, expect, test} from 'vitest';
import {execa} from 'execa';

import {TestAdapter} from '../fixtures';

const FLAGS = [
    '--no-lint',
    '--no-vcs',
    '--no-vcs-path',
    '--no-build-stats',
    '--no-build-content',
    '--jobs',
    '1',
];

describe('prepare native build inputs', () => {
    let work: string;
    let source: string;
    let prepared: string;

    beforeEach(async () => {
        work = await realpath(await mkdtemp(join(tmpdir(), 'yfm-prepare-test-')));
        source = join(work, 'source');
        prepared = join(work, 'prepared');
        await mkdir(source);
    });

    afterEach(async () => {
        await rm(work, {recursive: true, force: true});
    });

    async function files(root: string, values: Record<string, string>) {
        for (const [path, content] of Object.entries(values)) {
            const target = join(root, path);
            await mkdir(dirname(target), {recursive: true});
            await writeFile(target, content);
        }
    }

    async function run(command: string, input: string, output: string, flags: string[] = []) {
        const result = await TestAdapter.runner.runRaw([
            command,
            '-i',
            input,
            '-o',
            output,
            ...FLAGS,
            ...flags,
        ]);
        expect(result.code, result.stdout + result.stderr).toBe(0);
        return result;
    }

    async function tree(root: string): Promise<Record<string, string>> {
        const result: Record<string, string> = {};
        for (const entry of await readdir(root, {recursive: true, withFileTypes: true})) {
            if (entry.isFile()) {
                const path = join(entry.parentPath, entry.name);
                const content = await readFile(path);
                result[path.slice(root.length + 1)] = content.toString('base64');
                if (/\.(?:html|json|yaml|md)$/.test(path) || entry.name === 'toc.js') {
                    result[path.slice(root.length + 1)] = content
                        .toString()
                        .replace(
                            /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
                            '<UUID>',
                        );
                }
            }
        }
        return result;
    }

    test.each(['html', 'md'])(
        'preserves native %s output after moving the artifact and removing originals',
        async (format) => {
            await files(source, {
                '.yfm': 'allowHtml: true\nallowCustomResources: true\nresources:\n  style: [custom.css]\nvars:\n  heading: Config heading\n',
                'presets.yaml': 'default:\n  enabled: true\n',
                'toc.yaml': `title: Native
items:
  - href: index.md
  - href: hidden.md
    when: false
  - include: {path: linked/toc.yaml, mode: link}
  - include: {path: merged/fragment.yaml, mode: merge}
  - include: {path: default/fragment.yaml}
  - include:
      path: generated
      includers: [{name: generic, input: generated, autotitle: false}]
`,
                'index.md':
                    '# {{ heading }}\n\n{% include [Fragment](_includes/part.md) %}\n\n![Image](image.svg)\n\n{% code ".code/example.yaml" lang="yaml" %}\n',
                '.code/example.yaml': 'example: true\n',
                'custom.css': 'body {color: black;}\n',
                '_includes/part.md': 'Included content.\n',
                'image.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>',
                'linked/toc.yaml': 'items:\n  - href: linked.md\n',
                'linked/linked.md': '# Linked\n',
                'merged/fragment.yaml': 'items:\n  - href: merged.md\n',
                'merged/merged.md': '# Merged\n',
                'default/fragment.yaml': 'items:\n  - href: default.md\n',
                'default/default.md': '# Default merge\n',
                'generated/page.md': '# Generated\n',
                'unused.md': '# Unused\n',
                'unused.yaml': 'unused: true\n',
                'merged/unused.md': '# Unused merge source\n',
                'merged/unused.yaml': 'unused: true\n',
                'passthrough.txt': 'Native HTML passthrough\n',
            });
            const flags = ['-f', format];
            await run('build', source, join(work, 'baseline'), flags);
            await run('prepare', source, prepared, flags);
            for (const unused of [
                'unused.md',
                'unused.yaml',
                'merged/unused.md',
                'merged/unused.yaml',
            ]) {
                await expect(access(join(prepared, unused))).rejects.toThrow();
            }
            expect(await readFile(join(prepared, '.yfm'), 'utf8')).toBe(
                await readFile(join(source, '.yfm'), 'utf8'),
            );
            expect(await readFile(join(prepared, 'index.md'), 'utf8')).toBe(
                await readFile(join(source, 'index.md'), 'utf8'),
            );
            await expect(access(join(prepared, 'passthrough.txt'))).rejects.toThrow();
            await access(join(prepared, 'custom.css'));
            await access(join(prepared, 'image.svg'));
            const moved = join(work, 'moved');
            await rename(prepared, moved);
            await rename(source, join(work, 'unavailable'));
            await run('build', moved, join(work, 'rebuilt'), flags);
            const baseline = await tree(join(work, 'baseline'));
            // Native HTML currently copies this explicitly unrelated fixture file wholesale.
            delete baseline['passthrough.txt'];
            expect(await tree(join(work, 'rebuilt'))).toEqual(baseline);
        },
    );

    test('never stages an excluded unrelated tree and loads presets before native TOC conditions', async () => {
        await files(source, {
            '.yfm': '{}\n',
            'presets.yaml': 'default:\n  enabled: true\n  heading: Selected heading\n',
            'toc.yaml': 'items:\n  - href: selected/index.md\n    when: enabled\n',
            'selected/index.md': '# {{ heading }}\n',
            'unrelated/toc.yaml': 'this is not a valid TOC\n',
            'unrelated/presets.yaml': '[malformed: yaml\n',
            'unrelated/passthrough.txt': 'unrelated bytes\n',
        });
        await symlink('missing.tf', join(source, 'unrelated/versions.tf'));
        const result = await run('prepare', source, prepared, ['--ignore', '**/*/toc.yaml']);
        expect(result.stdout + result.stderr).not.toContain('unrelated/');
        for (const file of ['toc.yaml', 'presets.yaml', 'selected/index.md']) {
            await access(join(prepared, file));
        }
        await expect(access(join(prepared, 'unrelated'))).rejects.toThrow();
        await run('build', prepared, join(work, 'rebuilt'), ['--ignore', '**/*/toc.yaml']);
        expect(await readFile(join(work, 'rebuilt/selected/index.html'), 'utf8')).toContain(
            'Selected heading',
        );
    });

    test('fails on a selected broken dependency without publishing an artifact', async () => {
        await files(source, {'toc.yaml': 'items:\n  - href: broken.md\n'});
        await symlink('missing.md', join(source, 'broken.md'));
        const result = await TestAdapter.runner.runRaw([
            'prepare',
            '-i',
            source,
            '-o',
            prepared,
            ...FLAGS,
            '--ignore',
            '**/*/toc.yaml',
        ]);
        expect(result.code).not.toBe(0);
        await expect(access(prepared)).rejects.toThrow();
        expect(await readlink(join(source, 'broken.md'))).toBe('missing.md');
    });

    test('collects extension Run IO and explicitly declared data without blanket input copying', async () => {
        await files(source, {
            '.yfm': 'extensions: [./reader.cjs]\n',
            'toc.yaml': 'items:\n  - href: index.md\n',
            'index.md': '# Run IO\n',
            'data/title.json': '{"heading":"Selected Run data"}',
            'data/unused.yaml': 'unused: true',
            'support/extra.yaml': 'declared: true',
            'reader.cjs': `const {getHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/program/index.js'))});
const {getHooks: markdownHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/markdown/index.js'))});
exports.Extension = class {apply(program) {getHooks(program).BeforeAnyRun.tap('RunIO', run => {
 markdownHooks(run.markdown).Loaded.tapPromise('RunIO', async () => {
  const file = run.input + '/data/title.json';
  const paths = await run.glob('*.json', {cwd: run.input + '/data'});
  const value = JSON.parse(await run.read(file));
  if (!run.exists(file) || !(await run.stat(file)).isFile() || !run.statSync(file).size) throw Error('Missing source data');
  await run.depend(run.originalInput + '/support/extra.yaml');
  await run.write(run.output + '/read.json', JSON.stringify({paths, heading: value.heading}), true);
 });
});}};
`,
        });
        await run('build', source, join(work, 'baseline'));
        await run('prepare', source, prepared);
        await access(join(prepared, 'data/title.json'));
        await access(join(prepared, 'support/extra.yaml'));
        await expect(access(join(prepared, 'data/unused.yaml'))).rejects.toThrow();
        await rename(prepared, join(work, 'moved'));
        await rename(source, join(work, 'unavailable'));
        await run('build', join(work, 'moved'), join(work, 'rebuilt'));
        expect(await tree(join(work, 'rebuilt'))).toEqual(await tree(join(work, 'baseline')));
    });

    test.each(['merge', 'root_merge'])(
        'preserves native %s collision order, sourcePath and original preset scopes',
        async (mode) => {
            await files(source, {
                '.yfm': 'extensions: [./provenance.cjs]\n',
                'presets.yaml': 'default:\n  scope: ROOT\n  enabled: true\n',
                'toc.yaml': `items:
  - include: {path: first/fragment.yaml, mode: merge}
  - include: {path: second/fragment.yaml, mode: ${mode}}
  - include: {path: linked/toc.yaml, mode: link}
`,
                'same.md': '# Original destination {{ scope }}\n',
                'first/fragment.yaml':
                    'items:\n  - {href: same.md, when: enabled}\n  - href: first.md\n',
                'first/same.md': '# First collision {{ scope }}\n',
                'first/first.md': '# First retained {{ scope }}\n',
                'first/presets.yaml': 'default:\n  scope: FIRST\n  enabled: false\n',
                'second/fragment.yaml':
                    'items:\n  - {href: same.md, when: enabled}\n  - href: second.md\n',
                'second/same.md': '# Last collision {{ scope }}\n',
                'second/second.md': '# Second retained {{ scope }}\n',
                'second/presets.yaml': 'default:\n  scope: SECOND\n  enabled: false\n',
                'linked/toc.yaml': 'items:\n  - {href: page.md, when: enabled}\n',
                'linked/page.md': '# Linked {{ scope }}\n',
                'linked/presets.yaml': 'default:\n  scope: LINKED\n  enabled: true\n',
                'provenance.cjs': `const {getHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/program/index.js'))});
exports.Extension = class {apply(program) {getHooks(program).AfterAnyRun.tapPromise('Provenance', async run => {
 const paths = Object.fromEntries(run.toc.entries.map(path => [path, run.meta.get(path).sourcePath || path]));
 await run.write(run.output + '/provenance.json', JSON.stringify(paths), true);
});}};
`,
            });
            const flags = ['--ignore', '**/*/toc.yaml'];
            await run('build', source, join(work, 'baseline'), flags);
            const expected = await tree(join(work, 'baseline'));
            expect(
                JSON.parse(await readFile(join(work, 'baseline/provenance.json'), 'utf8')),
            ).toEqual({
                'same.md': 'second/same.md',
                'first.md': 'first/first.md',
                'second.md': 'second/second.md',
                'linked/page.md': 'linked/page.md',
            });
            expect(await readFile(join(work, 'baseline/same.html'), 'utf8')).toContain(
                'Last collision ROOT',
            );
            expect(await readFile(join(work, 'baseline/linked/page.html'), 'utf8')).toContain(
                'Linked LINKED',
            );
            await run('prepare', source, prepared, flags);
            for (const path of [
                'same.md',
                'first/same.md',
                'first/presets.yaml',
                'second/presets.yaml',
            ]) {
                await expect(access(join(prepared, path)), path).rejects.toThrow();
            }
            for (const path of [
                'presets.yaml',
                'second/same.md',
                'first/first.md',
                'second/second.md',
                'linked/presets.yaml',
            ]) {
                await access(join(prepared, path));
            }
            await rename(source, join(work, 'unavailable'));
            await run('build', prepared, join(work, 'rebuilt'), flags);
            expect(await tree(join(work, 'rebuilt'))).toEqual(expected);
        },
    );

    test.each([{}, {sourcePath: 'display/source.md'}, {vcsPath: 'repository/page.md'}])(
        'preserves copied source metadata %j when an includer hook overwrites its staged bytes',
        async (metadata) => {
            await files(source, {
                '.yfm': 'extensions: [./generated.cjs]\n',
                'toc.yaml': 'items:\n  - include: {path: source/fragment.yaml, mode: merge}\n',
                'source/fragment.yaml': 'items:\n  - href: page.md\n',
                'source/page.md': '# Copied source\n',
                'display/source.md': '# Unrelated display path\n',
                'repository/page.md': '# Unrelated VCS path\n',
                'generated.cjs': `const {getHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/program/index.js'))});
const {getHooks: tocHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/toc/index.js'))});
exports.Extension = class {apply(program) {
 getHooks(program).BeforeAnyRun.tap('GeneratedShadow', run => {
  run.meta.add('source/page.md', ${JSON.stringify(metadata)});
  tocHooks(run.toc).Included.tapPromise('GeneratedShadow', async () => {await run.write(run.input + '/page.md', '# Generated shadow\\n', true);});
 });
 getHooks(program).AfterAnyRun.tapPromise('GeneratedShadow', async run => {await run.write(run.output + '/provenance.json', JSON.stringify({sourcePath: run.meta.get('page.md').sourcePath}), true);});
}};
`,
            });
            await run('build', source, join(work, 'baseline'));
            expect(
                JSON.parse(await readFile(join(work, 'baseline/provenance.json'), 'utf8')),
            ).toEqual({
                sourcePath: metadata.vcsPath || metadata.sourcePath || 'source/page.md',
            });
            await run('prepare', source, prepared);
            expect(await readFile(join(prepared, 'source/page.md'), 'utf8')).toBe(
                '# Copied source\n',
            );
            await expect(access(join(prepared, 'page.md'))).rejects.toThrow();
            await expect(access(join(prepared, 'display/source.md'))).rejects.toThrow();
            await expect(access(join(prepared, 'repository/page.md'))).rejects.toThrow();
            await rename(source, join(work, 'unavailable'));
            await run('build', prepared, join(work, 'rebuilt'));
            expect(await tree(join(work, 'rebuilt'))).toEqual(await tree(join(work, 'baseline')));
        },
    );

    test('collects live HTML resource declarations without code, comments, remote URLs or blanket passthrough', async () => {
        await files(source, {
            'toc.yaml': 'items:\n  - href: pages/index.md\n',
            'pages/index.md': `# HTML resources

<iframe src="../viewers/viewer%20%26%20example.html?x=1&amp;y=2#graph"></iframe>
<iframe src="/assets/root.html?view=1#section"></iframe>
<iframe src="../viewers/external-base.html"></iframe>
<iframe src="https://example.invalid/remote.html"></iframe>
<iframe src="//example.invalid/protocol-relative.html"></iframe>
<iframe src="data:text/html,embedded"></iframe>
<iframe src="#fragment"></iframe>

<!-- <iframe src="../comment.html"></iframe> -->

\`\`\`html
<iframe src="../code.html"></iframe>
\`\`\`

&lt;iframe src="../escaped.html"&gt;&lt;/iframe&gt;

<template><iframe src="../template.html"></iframe></template>
`,
            'viewers/viewer & example.html': `<html><body>
<img src="./pixel.svg?version=1#image">
<script src="./viewer.js"></script>
<script src="./script-with-html-suffix.html"></script>
<script>const example = '<iframe src="../script-fake.html"></iframe>';</script>
<link rel="stylesheet" href="./viewer.css">
<iframe src="./nested.html"></iframe>
</body></html>`,
            'viewers/nested.html': '<iframe src="./viewer%20%26%20example.html"></iframe>',
            'viewers/pixel.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
            'viewers/viewer.js': 'console.log("viewer");',
            'viewers/script-with-html-suffix.html': `const example = '<iframe src="../script-file-fake.html"></iframe>';`,
            'script-file-fake.html':
                '<h1>Inert JavaScript string in a resource with an HTML suffix</h1>',
            'viewers/viewer.css': 'body {color: green;}',
            'viewers/external-base.html':
                '<base href="https://example.invalid/assets/"><img src="../remote-base-only.svg">',
            'assets/root.html': '<h1>Root-relative resource</h1>',
            'remote-base-only.svg': '<svg/>',
            'comment.html': '<h1>Unselected comment</h1>',
            'code.html': '<h1>Unselected code</h1>',
            'escaped.html': '<h1>Unselected escaped text</h1>',
            'template.html': '<h1>Inert template content</h1>',
            'script-fake.html': '<h1>Unselected script string</h1>',
            'unused.html': '<h1>Unrelated HTML passthrough</h1>',
        });
        const original = await tree(source);
        const flags = ['--allow-html', '--no-sanitize-html'];
        await run('build', source, join(work, 'baseline'), flags);
        await run('prepare', source, prepared, flags);
        const required = [
            'viewers/viewer & example.html',
            'viewers/nested.html',
            'viewers/pixel.svg',
            'viewers/viewer.js',
            'viewers/script-with-html-suffix.html',
            'viewers/viewer.css',
            'viewers/external-base.html',
            'assets/root.html',
        ];
        for (const path of required) {
            expect(await readFile(join(prepared, path), 'utf8')).toBe(
                await readFile(join(source, path), 'utf8'),
            );
        }
        for (const path of [
            'comment.html',
            'code.html',
            'escaped.html',
            'template.html',
            'script-fake.html',
            'script-file-fake.html',
            'unused.html',
            'remote-base-only.svg',
        ]) {
            await expect(access(join(prepared, path))).rejects.toThrow();
        }
        expect(await tree(source)).toEqual(original);
        await rename(source, join(work, 'unavailable'));
        await run('build', prepared, join(work, 'rebuilt'), flags);
        const expected = await tree(join(work, 'baseline'));
        const rebuilt = await tree(join(work, 'rebuilt'));
        expect(rebuilt['pages/index.html']).toBe(expected['pages/index.html']);
        for (const path of required) {
            expect(rebuilt[path]).toBe(expected[path]);
        }
    });

    test('collects native plain leading HTML fields while keeping text-only link labels unselected', async () => {
        await files(source, {
            'toc.yaml': 'items:\n  - href: index.yaml\n',
            'index.yaml': `title: '<img src="title.svg">Leading page'
description:
  - '<iframe src="viewer.html"></iframe>'
links:
  - title: '<iframe src="text-label.html"></iframe>'
    description: '<iframe src="text-description.html"></iframe>'
`,
            'title.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
            'viewer.html': '<h1>Leading viewer</h1>',
            'text-label.html': '<h1>Text only</h1>',
            'text-description.html': '<h1>Text only</h1>',
        });
        const flags = ['--static-content'];
        await run('build', source, join(work, 'baseline'), flags);
        await run('prepare', source, prepared, flags);
        await access(join(prepared, 'title.svg'));
        await access(join(prepared, 'viewer.html'));
        for (const path of ['text-label.html', 'text-description.html']) {
            await expect(access(join(prepared, path))).rejects.toThrow();
        }
        await rename(source, join(work, 'unavailable'));
        await run('build', prepared, join(work, 'rebuilt'), flags);
        expect((await tree(join(work, 'rebuilt')))['index.html']).toBe(
            (await tree(join(work, 'baseline')))['index.html'],
        );
    });

    test('rejects unsupported local HTML srcset without publishing a partial artifact', async () => {
        await files(source, {
            'toc.yaml': 'items:\n  - href: index.md\n',
            'index.md':
                '# Responsive HTML image\n\n<img src="small.svg" srcset="small.svg 1x, large.svg 2x">\n',
            'small.svg': '<svg/>',
            'large.svg': '<svg/>',
        });
        const original = await tree(source);
        await run('build', source, join(work, 'baseline'));
        const result = await TestAdapter.runner.runRaw([
            'prepare',
            '-i',
            source,
            '-o',
            prepared,
            ...FLAGS,
        ]);
        expect(result.code).not.toBe(0);
        expect(result.stderr).toContain('Prepare does not support HTML srcset or imagesrcset');
        await expect(access(prepared)).rejects.toThrow();
        expect(await tree(source)).toEqual(original);
    });

    test.each([
        {flags: ['--no-allow-html', '--no-sanitize-html'], iframe: false},
        {flags: ['--allow-html', '--sanitize-html'], iframe: true},
    ])(
        'collects only HTML resources retained by selected options $flags',
        async ({flags, iframe}) => {
            await files(source, {
                'toc.yaml': 'items:\n  - href: index.md\n',
                'index.md':
                    '# Selected HTML policy\n\n<iframe src="viewer.html"></iframe>\n\n<script src="raw-only.js"></script>\n',
                'viewer.html': '<h1>Selected viewer</h1>',
                'raw-only.js': 'console.log("raw HTML script");',
            });
            await run('build', source, join(work, 'baseline'), flags);
            await run('prepare', source, prepared, flags);
            if (iframe) {
                await access(join(prepared, 'viewer.html'));
            } else {
                await expect(access(join(prepared, 'viewer.html'))).rejects.toThrow();
            }
            await expect(access(join(prepared, 'raw-only.js'))).rejects.toThrow();
            await rename(source, join(work, 'unavailable'));
            await run('build', prepared, join(work, 'rebuilt'), flags);
            expect((await tree(join(work, 'rebuilt')))['index.html']).toBe(
                (await tree(join(work, 'baseline')))['index.html'],
            );
        },
    );

    test('rejects local HTML resource paths outside the selected input without publishing an artifact', async () => {
        await files(source, {
            'toc.yaml': 'items:\n  - href: index.md\n',
            'index.md': '# Outside resource\n\n<iframe src="../outside.html"></iframe>\n',
        });
        await files(work, {'outside.html': '<h1>Outside source</h1>'});
        const original = await tree(source);
        const result = await TestAdapter.runner.runRaw([
            'prepare',
            '-i',
            source,
            '-o',
            prepared,
            ...FLAGS,
            '--allow-html',
        ]);
        expect(result.code).not.toBe(0);
        expect(result.stderr).toContain('Local HTML resource escapes the input directory');
        await expect(access(prepared)).rejects.toThrow();
        expect(await tree(source)).toEqual(original);
        expect(await readFile(join(work, 'outside.html'), 'utf8')).toBe('<h1>Outside source</h1>');
    });

    test.each([
        {format: 'html', lintPath: '.yfmlint', enabled: true},
        {format: 'html', lintPath: '../settings/lint.yaml', enabled: true},
        {format: 'html', lintPath: '.yfmlint', enabled: false},
        {format: 'md', lintPath: '.yfmlint', enabled: true},
    ])(
        'preserves loaded redirects and lint config $lintPath in $format with lint enabled=$enabled',
        async ({format, lintPath, enabled}) => {
            const flags = ['-f', format, enabled ? '--lint' : '--no-lint'];
            const inputDirectory = lintPath.startsWith('../') ? 'source' : '.';
            await files(source, {
                '.yfm':
                    lintPath === '.yfmlint'
                        ? 'build: {}\n'
                        : `build:\n  lint:\n    enabled: ${enabled}\n    config: ${lintPath}\n`,
                'toc.yaml': 'items:\n  - href: index.md\n',
                'index.md': '# Page\n\n[Missing](#absent)\n',
                'redirects.yaml': 'files:\n  - from: old\n    to: index\n',
                [lintPath]: 'YFM025: false\n',
            });
            const baseline = await run('build', source, join(work, 'baseline'), flags);
            expect(baseline.stdout + baseline.stderr).not.toContain('YFM025');
            await run('prepare', source, prepared, flags);
            const preparedInput = join(prepared, inputDirectory);
            expect(await readFile(join(preparedInput, 'redirects.yaml'), 'utf8')).toBe(
                'files:\n  - from: old\n    to: index\n',
            );
            if (enabled) {
                expect(await readFile(join(preparedInput, lintPath), 'utf8')).toBe(
                    'YFM025: false\n',
                );
            } else {
                await expect(access(join(preparedInput, lintPath))).rejects.toThrow();
            }
            await rename(prepared, join(work, 'moved'));
            await rename(source, join(work, 'unavailable'));
            if (lintPath.startsWith('../')) {
                await rename(join(work, 'settings'), join(work, 'settings-unavailable'));
            }
            const rebuilt = await run(
                'build',
                join(work, 'moved', inputDirectory),
                join(work, 'rebuilt'),
                flags,
            );
            expect(rebuilt.stdout + rebuilt.stderr).not.toContain('YFM025');
            const expected = await tree(join(work, 'baseline'));
            const actual = await tree(join(work, 'rebuilt'));
            const outputs =
                format === 'html'
                    ? ['index.html', 'old', 'toc.js']
                    : ['index.md', 'redirects.yaml', 'toc.yaml'];
            for (const path of outputs) {
                expect(actual[path], path).toBe(expected[path]);
                expect(actual[path], path).toBeDefined();
            }
        },
    );

    test('preserves external config and config-relative extension dependencies', async () => {
        await files(source, {
            'toc.yaml': 'items:\n  - href: index.md\n',
            'index.md': '# {{ heading }}\n',
        });
        await files(work, {
            'settings/project.yaml':
                'extensions:\n  - ../plugins/title.cjs\nbuild:\n  vars: {heading: Config}\n',
            'plugins/message.json': '{"heading":"External heading"}',
            'plugins/helper.cjs': "module.exports = require('./message.json');\n",
            'plugins/title.cjs': `const {getHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/program/index.js'))});
const message = require('./helper.cjs');
exports.Extension = class {apply(program) {program.depend(__dirname + '/helper.cjs'); program.depend(__dirname + '/message.json'); getHooks(program).Config.tap('Fixture', config => {config.vars = {...config.vars, heading: message.heading}; return config;});}};
`,
        });
        const config = join(work, 'settings/project.yaml');
        await run('build', source, join(work, 'baseline'), ['-c', config]);
        const result = await run('prepare', source, prepared, ['-c', config]);
        expect(result.stdout).toContain(join(prepared, 'source'));
        for (const directory of ['source', 'settings', 'plugins']) {
            await rename(join(work, directory), join(work, `${directory}-unavailable`));
        }
        await run('build', join(prepared, 'source'), join(work, 'rebuilt'), [
            '-c',
            join(prepared, 'settings/project.yaml'),
        ]);
        expect(await tree(join(work, 'rebuilt'))).toEqual(await tree(join(work, 'baseline')));
    });

    test.each([
        {kind: 'file alias', name: './alias.cjs'},
        {kind: 'directory alias', name: './alias'},
        {kind: 'package main', name: './plugin'},
    ])(
        'preserves configured local extension resolution through $kind after relocation',
        async ({kind, name}) => {
            const flags = ['-f', 'md'];
            await files(source, {
                '.yfm': `extensions: [${name}]\n`,
                'toc.yaml': 'items:\n  - href: index.md\n',
                'index.md': '# {{ heading }}\n',
                'plugin/package.json': '{"main":"actual.cjs"}',
                'plugin/unused.json': '{"unused":true}',
                'plugin/actual.cjs': `const {getHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/program/index.js'))});
exports.Extension = class {apply(program) {getHooks(program).Config.tap('EntryResolution', config => {config.vars = {...config.vars, heading: 'Resolved local entry'}; return config;});}};\n`,
            });
            if (kind === 'file alias') {
                await symlink('plugin/actual.cjs', join(source, 'alias.cjs'));
            } else if (kind === 'directory alias') {
                await symlink('plugin', join(source, 'alias'));
            }
            await run('build', source, join(work, 'baseline'), flags);
            await run('prepare', source, prepared, flags);
            await expect(access(join(prepared, 'plugin/unused.json'))).rejects.toThrow();
            await access(join(prepared, 'plugin/actual.cjs'));
            if (kind === 'file alias') {
                expect(await readlink(join(prepared, 'alias.cjs'))).toBe('plugin/actual.cjs');
                await expect(access(join(prepared, 'plugin/package.json'))).rejects.toThrow();
            } else {
                expect(await readFile(join(prepared, 'plugin/package.json'), 'utf8')).toBe(
                    '{"main":"actual.cjs"}',
                );
            }
            if (kind === 'directory alias') {
                expect(await readlink(join(prepared, 'alias'))).toBe('plugin');
            }
            await rename(prepared, join(work, 'moved'));
            await rename(source, join(work, 'unavailable'));
            await run('build', join(work, 'moved'), join(work, 'rebuilt'), flags);
            expect(await tree(join(work, 'rebuilt'))).toEqual(await tree(join(work, 'baseline')));
        },
    );

    test('relocates CLI-local extensions and distinguishes a global option value named prepare', async () => {
        const binary =
            process.env.DIPLODOC_BINARY_PATH || resolve(__dirname, '../../build/index.js');
        await files(source, {
            'toc.yaml': 'items:\n  - href: index.md\n',
            'index.md': '# {{ heading }}\n',
        });
        await rename(source, join(work, 'prepare'));
        await files(work, {
            'plugins/decision.yaml': 'heading size',
            'plugins/title.cjs': `const {getHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/program/index.js'))});
const fs = require('node:fs');
exports.Extension = class {apply(program) {program.depend(__dirname + '/decision.yaml'); getHooks(program).Config.tap('MetadataFixture', config => {let heading; try {heading = 'SIZE' + fs.statSync(__dirname + '/decision.yaml').size;} catch {heading = 'MISSING';} config.vars = {...config.vars, heading}; return config;});}};
`,
        });
        const native = await execa(
            binary,
            [
                '-i',
                'prepare',
                '-e',
                './plugins/title.cjs',
                'build',
                '-o',
                join(work, 'baseline'),
                ...FLAGS,
            ],
            {cwd: work, reject: false},
        );
        expect(native.exitCode, native.stderr).toBe(0);
        const result = await execa(
            binary,
            ['-i', 'prepare', '-e', './plugins/title.cjs', 'prepare', '-o', prepared, ...FLAGS],
            {cwd: work, reject: false},
        );
        expect(result.exitCode, result.stdout + result.stderr).toBe(0);
        expect(result.stdout).toContain(join(prepared, 'plugins/title.cjs'));
        await access(join(prepared, 'plugins/decision.yaml'));
        await rename(join(work, 'prepare'), join(work, 'source-unavailable'));
        await rename(join(work, 'plugins'), join(work, 'plugins-unavailable'));
        await run('build', join(prepared, 'prepare'), join(work, 'rebuilt'), [
            '-e',
            join(prepared, 'plugins/title.cjs'),
        ]);
        expect(await tree(join(work, 'rebuilt'))).toEqual(await tree(join(work, 'baseline')));
    });

    test('does not create the artifact for dry runs or failed discovery', async () => {
        await files(source, {'toc.yaml': 'items:\n  - href: index.md\n', 'index.md': '# Valid\n'});
        await run('prepare', source, prepared, ['--dry-run']);
        await expect(access(prepared)).rejects.toThrow();
        await writeFile(join(source, 'toc.yaml'), 'items:\n  - href: missing.md\n');
        const result = await TestAdapter.runner.runRaw([
            'prepare',
            '-i',
            source,
            '-o',
            prepared,
            ...FLAGS,
        ]);
        expect(result.code).not.toBe(0);
        await expect(access(prepared)).rejects.toThrow();
    });

    test('collects OpenAPI local refs and custom landing Markdown through native parser IO', async () => {
        await files(source, {
            'toc.yaml': `title: API
items:
  - name: API
    include:
      path: api
      mode: link
      includers:
        - name: openapi
          input: spec.yaml
          tags:
            __root__: {path: custom.md}
`,
            'spec.yaml': `openapi: 3.0.0
info: {title: Example API, version: '1.0'}
paths:
  /pets:
    get:
      operationId: pets
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema: {$ref: './models.yaml#/Pet'}
`,
            'models.yaml': 'Pet:\n  type: object\n  properties:\n    id: {type: integer}\n',
            'custom.md': '# Custom API landing\n',
            'unused.md': '# Unused\n',
            'unused.yaml': 'unused: true\n',
        });
        await run('build', source, join(work, 'baseline'));
        await run('prepare', source, prepared);
        for (const used of ['spec.yaml', 'models.yaml', 'custom.md']) {
            await access(join(prepared, used));
        }
        for (const unused of ['unused.md', 'unused.yaml']) {
            await expect(access(join(prepared, unused))).rejects.toThrow();
        }
        await rename(source, join(work, 'unavailable'));
        await run('build', prepared, join(work, 'rebuilt'));
        expect(await tree(join(work, 'rebuilt'))).toEqual(await tree(join(work, 'baseline')));
    });

    test('rejects dependencies that still use an absolute original project path after relocation', async () => {
        const plugin = join(work, 'plugins/absolute.cjs');
        await files(work, {'plugins/absolute.cjs': 'exports.Extension = class {apply() {}};\n'});
        await files(source, {
            '.yfm': `extensions:\n  - ${JSON.stringify(plugin)}\n`,
            'toc.yaml': 'items:\n  - href: index.md\n',
            'index.md': '# Example\n',
        });
        const result = await TestAdapter.runner.runRaw([
            'prepare',
            '-i',
            source,
            '-o',
            prepared,
            ...FLAGS,
        ]);
        expect(result.code).not.toBe(0);
        expect(result.stderr).toContain('original paths after relocation');
        await expect(access(prepared)).rejects.toThrow();
    });

    test('fails preparation when the native MD asset size check fails', async () => {
        await files(source, {
            'toc.yaml': 'items:\n  - href: index.md\n',
            'index.md': '# Image\n\n![Image](large.png)\n',
            'large.png': 'oversized image bytes',
        });
        const flags = ['-f', 'md', '--max-asset-size', '1'];
        for (const command of ['build', 'prepare']) {
            const result = await TestAdapter.runner.runRaw([
                command,
                '-i',
                source,
                '-o',
                command === 'build' ? join(work, 'baseline') : prepared,
                ...FLAGS,
                ...flags,
            ]);
            expect(result.code).not.toBe(0);
            expect(result.stderr).toContain('YFM013');
        }
        await expect(access(prepared)).rejects.toThrow();
    });

    test('preserves source timestamps used by the native mtimes option', async () => {
        await files(source, {
            '.yfm': '{}\n',
            'toc.yaml': 'items:\n  - href: index.md\n',
            'index.md': '# Dated source\n',
        });
        const stamp = new Date('2000-01-01T00:00:00Z');
        await utimes(join(source, 'index.md'), stamp, stamp);
        const flags = ['--mtimes'];
        await run('build', source, join(work, 'baseline'), flags);
        await run('prepare', source, prepared, flags);
        await rename(source, join(work, 'unavailable'));
        await run('build', prepared, join(work, 'rebuilt'), flags);
        expect(await tree(join(work, 'rebuilt'))).toEqual(await tree(join(work, 'baseline')));
    });

    test('preserves needed relative file and directory symlinks with their targets after relocation', async () => {
        await files(source, {
            '.yfm': 'extensions: [./links.cjs]\n',
            'toc.yaml': 'items:\n  - href: index.md\n',
            'index.md': '# {{ heading }}\n',
            'target.yaml': 'valuable: linked\n',
            'payload/value.yaml': 'directory: target\n',
            'payload/unused.yaml': 'unused: true\n',
            'links.cjs': `const {getHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/program/index.js'))});
const fs = require('node:fs');
exports.Extension = class {apply(program) {getHooks(program).Config.tap('SourceLinks', config => {program.depend(config.input + '/alias.yaml'); program.depend(config.input + '/directory/value.yaml'); const alias = config.input + '/alias.yaml'; const dir = config.input + '/directory'; config.vars = {...config.vars, heading: fs.lstatSync(alias).isSymbolicLink() && fs.readlinkSync(alias) === 'target.yaml' && fs.lstatSync(dir).isSymbolicLink() && fs.readFileSync(dir + '/value.yaml', 'utf8').includes('target') ? 'SYMLINK' : 'REGULAR'}; return config;});}};
`,
        });
        await symlink('target.yaml', join(source, 'alias.yaml'));
        await symlink('payload', join(source, 'directory'));
        const flags = ['-f', 'md'];
        await run('build', source, join(work, 'baseline'), flags);
        await run('prepare', source, prepared, flags);
        expect((await lstat(join(prepared, 'alias.yaml'))).isSymbolicLink()).toBe(true);
        expect(await readlink(join(prepared, 'alias.yaml'))).toBe('target.yaml');
        expect((await lstat(join(prepared, 'directory'))).isSymbolicLink()).toBe(true);
        await expect(access(join(prepared, 'payload/unused.yaml'))).rejects.toThrow();
        await rename(source, join(work, 'unavailable'));
        await run('build', prepared, join(work, 'rebuilt'), flags);
        expect(await tree(join(work, 'rebuilt'))).toEqual(await tree(join(work, 'baseline')));
    });

    test.each(['dangling', 'cyclic', 'absolute'])(
        'rejects a declared %s symlink before publishing an inequivalent artifact',
        async (kind) => {
            await files(source, {
                '.yfm': 'extensions: [./links.cjs]\n',
                'toc.yaml': 'items:\n  - href: index.md\n',
                'index.md': '# {{ heading }}\n',
                'target.yaml': 'valuable: linked\n',
                'links.cjs': `const {getHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/program/index.js'))});
const fs = require('node:fs');
exports.Extension = class {apply(program) {getHooks(program).Config.tap('SourceLinks', config => {program.depend(config.input + '/../alias.yaml'); config.vars = {...config.vars, heading: fs.lstatSync(config.input + '/../alias.yaml').isSymbolicLink() ? 'SYMLINK' : 'REGULAR'}; return config;});}};
`,
            });
            let target = 'missing.yaml';
            if (kind === 'cyclic') {
                target = 'alias.yaml';
            }
            if (kind === 'absolute') {
                target = join(source, 'target.yaml');
            }
            await symlink(target, join(work, 'alias.yaml'));
            await run('build', source, join(work, 'baseline'), ['-f', 'md']);
            const result = await TestAdapter.runner.runRaw([
                'prepare',
                '-i',
                source,
                '-o',
                prepared,
                '-f',
                'md',
                ...FLAGS,
            ]);
            expect(result.code).not.toBe(0);
            expect(result.stderr).toContain('alias.yaml');
            await expect(access(prepared)).rejects.toThrow();
            expect((await lstat(join(work, 'alias.yaml'))).isSymbolicLink()).toBe(true);
        },
    );
});
