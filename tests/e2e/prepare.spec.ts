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
        for (const file of ['toc.yaml', 'presets.yaml', 'selected/index.md'])
            await access(join(prepared, file));
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

    test('supports direct Node reads of lazy staged input in native extension hooks', async () => {
        await files(source, {
            '.yfm': 'extensions: [./reader.cjs]\n',
            'toc.yaml': 'items:\n  - href: index.md\n',
            'index.md': '# Direct staged read\n',
            'data/title.json': '{"heading":"Direct staged read"}',
            'reader.cjs': `const {getHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/program/index.js'))});
const fs = require('node:fs');
const {getHooks: markdownHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/markdown/index.js'))});
exports.Extension = class {apply(program) {getHooks(program).BeforeAnyRun.tap('DirectStageRead', run => {
 markdownHooks(run.markdown).Loaded.tapPromise('DirectStageRead', async () => {
 const file = run.input + '/data/title.json';
 const value = JSON.parse(await fs.promises.readFile(file, 'utf8'));
 if (!fs.statSync(file).isFile() || !fs.readdirSync(run.input + '/data').includes('title.json')) throw Error('Missing lazy input');
 if (value.heading !== 'Direct staged read') throw Error('Unexpected staged bytes');
 });
});}};
`,
        });
        await run('prepare', source, prepared);
        await access(join(prepared, 'data/title.json'));
        await rename(source, join(work, 'unavailable'));
        await run('build', prepared, join(work, 'rebuilt'));
        expect(await readFile(join(work, 'rebuilt/index.html'), 'utf8')).toContain(
            'Direct staged read',
        );
    });

    test.each(['Config', 'staged Markdown.Loaded'])(
        'preserves successful realpath and readonly-open decisions in %s after moving the artifact',
        async (phase) => {
            const variants = [
                'realpath-sync',
                'realpath-sync-native',
                'realpath-callback',
                'realpath-callback-native',
                'realpath-promise',
                'open-sync',
                'open-callback',
                'open-promise',
            ];
            await files(source, {
                '.yfm': 'extensions: [./decisions.cjs]\n',
                'toc.yaml': 'items:\n  - href: index.md\n',
                'index.md': phase === 'Config' ? '# {{ heading }}\n' : '# Staged read decisions\n',
                'markers/target.yaml': 'native alias target: original bytes\n',
                'directory-only/unselected.yaml':
                    'directory metadata does not select these bytes\n',
                'decisions.cjs': `const fs = require('node:fs');
const {basename} = require('node:path');
const {getHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/program/index.js'))});
const {getHooks: markdownHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/markdown/index.js'))});
const variants = [
 ['realpath-sync', file => fs.realpathSync(file, {encoding: 'buffer'}).toString()],
 ['realpath-sync-native', file => fs.realpathSync.native(file)],
 ['realpath-callback', file => new Promise((resolve, reject) => fs.realpath(file, (error, value) => error ? reject(error) : resolve(value)))],
 ['realpath-callback-native', file => new Promise((resolve, reject) => fs.realpath.native(file, {encoding: 'buffer'}, (error, value) => error ? reject(error) : resolve(value.toString())))],
 ['realpath-promise', file => fs.promises.realpath(file)],
 ['open-sync', file => {const fd = fs.openSync(file, 'rs'); fs.closeSync(fd); return file;}],
 ['open-callback', file => new Promise((resolve, reject) => fs.open(file, fs.constants.O_RDONLY, (error, fd) => {if (error) reject(error); else {fs.closeSync(fd); resolve(file);}}))],
 ['open-promise', async file => {const handle = await fs.promises.open(file); await handle.close(); return file;}],
];
async function decisions(base) {
 const results = [];
 for (const [name, action] of variants) {
  try {const path = await action(base + '/markers/' + name + '.yaml'); results.push(name + ':PRESENT:' + basename(path));}
  catch {results.push(name + ':ABSENT');}
 }
 ${phase === 'Config' ? `try {fs.realpathSync(base + '/directory-only'); results.push('DIRECTORY_PRESENT');} catch {results.push('DIRECTORY_ABSENT');}` : ''}
 return results.join(' ');
}
exports.Extension = class {apply(program) {
 ${phase === 'Config' ? `getHooks(program).Config.tapPromise('ReadDecisions', async config => {config.vars = {...config.vars, heading: await decisions(config.input)}; return config;});` : `getHooks(program).BeforeAnyRun.tap('ReadDecisions', run => {if (!run.markdown) return; markdownHooks(run.markdown).Loaded.tapPromise('ReadDecisions', async (_content, meta) => {meta.title = await decisions(run.input);});});`}
}};
`,
            });
            for (const name of variants) {
                if (name === 'realpath-sync-native') continue;
                await files(source, {[`markers/${name}.yaml`]: `${name}: original bytes\n`});
            }
            await symlink('target.yaml', join(source, 'markers/realpath-sync-native.yaml'));
            const original = await tree(source);
            await run('build', source, join(work, 'baseline'));
            const expected = await tree(join(work, 'baseline'));
            const html = await readFile(join(work, 'baseline/index.html'), 'utf8');
            expect(html).not.toContain(':ABSENT');
            for (const name of variants) expect(html).toContain(`${name}:PRESENT:`);
            expect(html).toContain(
                `realpath-sync-native:PRESENT:${phase === 'Config' ? 'target' : 'realpath-sync-native'}.yaml`,
            );
            await run('prepare', source, prepared);
            for (const name of variants)
                expect(await readFile(join(prepared, `markers/${name}.yaml`), 'utf8')).toBe(
                    await readFile(join(source, `markers/${name}.yaml`), 'utf8'),
                );
            expect(await readlink(join(prepared, 'markers/realpath-sync-native.yaml'))).toBe(
                'target.yaml',
            );
            await expect(
                access(join(prepared, 'directory-only/unselected.yaml')),
            ).rejects.toThrow();
            if (phase === 'Config')
                expect((await lstat(join(prepared, 'directory-only'))).isDirectory()).toBe(true);
            expect(await tree(source)).toEqual(original);
            expect(await readlink(join(source, 'markers/realpath-sync-native.yaml'))).toBe(
                'target.yaml',
            );
            await rename(source, join(work, 'unavailable'));
            await rename(prepared, join(work, 'moved'));
            await run('build', join(work, 'moved'), join(work, 'rebuilt'));
            expect(await tree(join(work, 'rebuilt'))).toEqual(expected);
        },
    );

    test.each(['sync', 'callback', 'promise'])(
        'matches copied-stage symlink metadata and physical generated entries through %s APIs',
        async (api) => {
            await files(source, {
                '.yfm': 'extensions: [./metadata.cjs]\n',
                'toc.yaml': 'items:\n  - href: index.md\n',
                'index.md': '# Copied metadata\n',
                'inspect/target.yaml': 'file target bytes\n',
                'inspect/target-dir/value.yaml': 'directory target bytes\n',
                'readlink-only/target.yaml': 'readlink-only file bytes\n',
                'readlink-only/target-dir/value.yaml': 'readlink-only directory bytes\n',
                'metadata.cjs': `const fs = require('node:fs');
const {getHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/program/index.js'))});
const {getHooks: markdownHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/markdown/index.js'))});
async function call(name, ...args) {
 if (${JSON.stringify(api)} === 'sync') return fs[name + 'Sync'](...args);
 if (${JSON.stringify(api)} === 'promise') return fs.promises[name](...args);
 return new Promise((resolve, reject) => fs[name](...args, (error, value) => error ? reject(error) : resolve(value)));
}
exports.Extension = class {apply(program) {getHooks(program).BeforeAnyRun.tap('Metadata', run => {
 if (!run.markdown) return;
 markdownHooks(run.markdown).Loaded.tapPromise('Metadata', async (_content, meta) => {
  const base = run.input;
  const decisions = [];
  const file = await call('lstat', base + '/inspect/alias.yaml');
  decisions.push(['file', file.isFile() && !file.isSymbolicLink()]);
  const dir = await call('lstat', base + '/inspect/diralias');
  decisions.push(['directory', dir.isDirectory() && !dir.isSymbolicLink()]);
  for (const [name, path] of [['readlink-file', 'alias.yaml'], ['readlink-directory', 'diralias']]) {
   let code; try {await call('readlink', base + '/readlink-only/' + path);} catch (error) {code = error.code;}
   decisions.push([name, code === 'EINVAL']);
  }
  const entries = await call('readdir', base + '/inspect', {withFileTypes: true});
  const alias = entries.find(entry => entry.name === 'alias.yaml');
  const diralias = entries.find(entry => entry.name === 'diralias');
  decisions.push(['dirent-file', alias.isFile() && !alias.isSymbolicLink()]);
  decisions.push(['dirent-directory', diralias.isDirectory() && !diralias.isSymbolicLink()]);
  const buffered = await call('readdir', base + '/inspect', {withFileTypes: true, encoding: 'buffer'});
  decisions.push(['dirent-buffer', buffered.every(entry => Buffer.isBuffer(entry.name))]);
  fs.mkdirSync(base + '/generated-empty', {recursive: true});
  fs.writeFileSync(base + '/generated-target.yaml', 'physical target');
  try {fs.symlinkSync('generated-target.yaml', base + '/generated-alias.yaml');} catch (error) {if (error.code !== 'EEXIST') throw error;}
  const generated = await call('lstat', base + '/generated-alias.yaml');
  decisions.push(['physical', generated.isSymbolicLink() && await call('readlink', base + '/generated-alias.yaml') === 'generated-target.yaml' && fs.existsSync(base + '/generated-empty')]);
  meta.title = decisions.map(([name, matches]) => fs.readFileSync(base + '/conditional/' + name + '-' + (matches ? 'native' : 'wrong') + '.yaml', 'utf8').trim()).join(' ');
 });
});}};
`,
            });
            const names = [
                'file',
                'directory',
                'readlink-file',
                'readlink-directory',
                'dirent-file',
                'dirent-directory',
                'dirent-buffer',
                'physical',
            ];
            for (const name of names)
                await files(source, {
                    [`conditional/${name}-native.yaml`]: `${name.toUpperCase()}_NATIVE\n`,
                    [`conditional/${name}-wrong.yaml`]: `${name.toUpperCase()}_WRONG\n`,
                });
            await symlink('target.yaml', join(source, 'inspect/alias.yaml'));
            await symlink('target-dir', join(source, 'inspect/diralias'));
            await symlink('target.yaml', join(source, 'readlink-only/alias.yaml'));
            await symlink('target-dir', join(source, 'readlink-only/diralias'));
            const original = await tree(source);
            await run('build', source, join(work, 'baseline'));
            const expected = await tree(join(work, 'baseline'));
            for (const name of names)
                expect(expected['index.html']).toContain(`${name.toUpperCase()}_NATIVE`);
            await run('prepare', source, prepared);
            for (const name of names) {
                expect(
                    await readFile(join(prepared, `conditional/${name}-native.yaml`), 'utf8'),
                ).toBe(`${name.toUpperCase()}_NATIVE\n`);
                await expect(
                    access(join(prepared, `conditional/${name}-wrong.yaml`)),
                ).rejects.toThrow();
            }
            expect(await readlink(join(prepared, 'inspect/alias.yaml'))).toBe('target.yaml');
            expect(await readlink(join(prepared, 'inspect/diralias'))).toBe('target-dir');
            expect(await readlink(join(prepared, 'readlink-only/alias.yaml'))).toBe('target.yaml');
            expect(await readFile(join(prepared, 'readlink-only/target.yaml'), 'utf8')).toBe(
                'readlink-only file bytes\n',
            );
            expect(await readlink(join(prepared, 'readlink-only/diralias'))).toBe('target-dir');
            expect(
                await readFile(join(prepared, 'readlink-only/target-dir/value.yaml'), 'utf8'),
            ).toBe('readlink-only directory bytes\n');
            await expect(access(join(prepared, 'generated-alias.yaml'))).rejects.toThrow();
            expect(await readlink(join(source, 'inspect/alias.yaml'))).toBe('target.yaml');
            expect(await readlink(join(source, 'inspect/diralias'))).toBe('target-dir');
            expect(await readlink(join(source, 'readlink-only/alias.yaml'))).toBe('target.yaml');
            expect(await readlink(join(source, 'readlink-only/diralias'))).toBe('target-dir');
            expect(await tree(source)).toEqual(original);
            await rename(source, join(work, 'unavailable'));
            await rename(prepared, join(work, 'moved'));
            await run('build', join(work, 'moved'), join(work, 'rebuilt'));
            expect(await tree(join(work, 'rebuilt'))).toEqual(expected);
        },
    );

    test('matches copied directory visibility and adds only uncovered directory witnesses', async () => {
        await files(source, {
            '.yfm': 'extensions: [./directories.cjs]\n',
            'toc.yaml':
                'items:\n  - href: index.md\n  - include: {path: merge/fragment.yaml, mode: merge}\n',
            'index.md': '# {{ heading }}\n',
            'ignored-only/node_modules/ignored.yaml': 'native copy ignores this child\n',
            'witness-only/only.yaml': 'minimal directory witness\n',
            'covered/a-unselected.yaml': 'not needed when another child is selected\n',
            'covered/z-selected.yaml': 'selected file recreates covered directory\n',
            'merge/fragment.yaml': 'items:\n  - href: merged.md\n',
            'merge/merged.md': '# Merged document\n',
            'merge/covered/z-selected.yaml': 'merged override of selected file\n',
            'merge/merged-covered/a-unselected.yaml': 'not needed through merge alias\n',
            'merge/merged-covered/z-selected.yaml': 'selected through merge alias\n',
            'conditional/visibility-native.yaml': 'VISIBLE_NATIVE\n',
            'conditional/visibility-wrong.yaml': 'VISIBLE_WRONG\n',
            'directories.cjs': `const fs = require('node:fs');
const {getHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/program/index.js'))});
const {getHooks: markdownHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/markdown/index.js'))});
const {getHooks: tocHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/toc/index.js'))});
exports.Extension = class {apply(program) {
 getHooks(program).Config.tap('OriginalDirectories', config => {
  config.vars = {...config.vars, heading: fs.existsSync(config.input + '/empty') && fs.existsSync(config.input + '/nested-empty/deep') ? 'ORIGINAL_EMPTY_PRESENT' : 'ORIGINAL_EMPTY_MISSING'};
  return config;
 });
 getHooks(program).BeforeAnyRun.tap('CopiedDirectories', run => {
  if (!run.markdown) return;
  let beforeMerge;
  tocHooks(run.toc).Item.tap('ObserveBeforeMerge', item => {
   if (item.include?.path === 'merge/fragment.yaml') {
    if (!fs.existsSync(run.input + '/covered')) throw new Error('Original directory missing');
    beforeMerge = fs.readFileSync(run.input + '/covered/z-selected.yaml', 'utf8');
   }
   return item;
  });
  markdownHooks(run.markdown).Loaded.tap('CopiedDirectories', (_content, meta) => {
   const base = run.input;
   const absent = ['empty', 'nested-empty', 'ignored-only'].every(path => !fs.existsSync(base + '/' + path));
   const present = fs.existsSync(base + '/witness-only') && fs.statSync(base + '/covered').isDirectory() && fs.realpathSync(base + '/merged-covered').endsWith('merged-covered');
   fs.readFileSync(base + '/covered/z-selected.yaml');
   fs.readFileSync(base + '/merged-covered/z-selected.yaml');
   meta.description = fs.readFileSync(base + '/conditional/visibility-' + (absent && present && beforeMerge.includes('selected file recreates') ? 'native' : 'wrong') + '.yaml', 'utf8').trim();
  });
 });
}};
`,
        });
        await mkdir(join(source, 'empty'));
        await mkdir(join(source, 'nested-empty/deep'), {recursive: true});
        const original = await tree(source);
        await run('build', source, join(work, 'baseline'));
        const expected = await tree(join(work, 'baseline'));
        expect(expected['index.html']).toContain('ORIGINAL_EMPTY_PRESENT');
        expect(expected['index.html']).toContain('VISIBLE_NATIVE');
        await run('prepare', source, prepared);
        expect(await readFile(join(prepared, 'witness-only/only.yaml'), 'utf8')).toBe(
            'minimal directory witness\n',
        );
        expect(await readFile(join(prepared, 'covered/z-selected.yaml'), 'utf8')).toBe(
            'selected file recreates covered directory\n',
        );
        expect(await readFile(join(prepared, 'merge/covered/z-selected.yaml'), 'utf8')).toBe(
            'merged override of selected file\n',
        );
        expect(await readFile(join(prepared, 'merge/merged-covered/z-selected.yaml'), 'utf8')).toBe(
            'selected through merge alias\n',
        );
        for (const path of [
            'covered/a-unselected.yaml',
            'merge/merged-covered/a-unselected.yaml',
            'ignored-only/node_modules/ignored.yaml',
            'conditional/visibility-wrong.yaml',
        ])
            await expect(access(join(prepared, path))).rejects.toThrow();
        expect((await lstat(join(prepared, 'empty'))).isDirectory()).toBe(true);
        expect((await lstat(join(prepared, 'nested-empty/deep'))).isDirectory()).toBe(true);
        expect(await tree(source)).toEqual(original);
        await rename(source, join(work, 'unavailable'));
        await rename(prepared, join(work, 'moved'));
        await run('build', join(work, 'moved'), join(work, 'rebuilt'));
        expect(await tree(join(work, 'rebuilt'))).toEqual(expected);
    });

    test.each([
        ['a', 'z'],
        ['z', 'a'],
    ])(
        'preserves native merged directory order with original %s and merged %s entries',
        async (originalName, mergedName) => {
            await files(source, {
                '.yfm': 'extensions: [./order.cjs]\n',
                'toc.yaml':
                    'items:\n  - href: index.md\n  - include: {path: merge/fragment.yaml, mode: merge}\n',
                'index.md': '# Merged directory order\n',
                [`inspect/${originalName}.flag`]: `original ${originalName}\n`,
                'merge/fragment.yaml': 'items:\n  - href: merged.md\n',
                'merge/merged.md': '# Merged\n',
                [`merge/inspect/${mergedName}.flag`]: `merged ${mergedName}\n`,
                'conditional/a.yaml': 'A_DATA\n',
                'conditional/z.yaml': 'Z_DATA\n',
                'order.cjs': `const fs = require('node:fs');
const {getHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/program/index.js'))});
const {getHooks: markdownHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/markdown/index.js'))});
exports.Extension = class {apply(program) {getHooks(program).BeforeAnyRun.tap('MergedOrder', run => {
 if (!run.markdown) return;
 markdownHooks(run.markdown).Loaded.tap('MergedOrder', (_content, meta) => {
  const first = fs.readdirSync(run.input + '/inspect').find(name => name.endsWith('.flag'));
  meta.title = fs.readFileSync(run.input + '/conditional/' + first[0] + '.yaml', 'utf8').trim();
 });
});}};
`,
            });
            const original = await tree(source);
            await run('build', source, join(work, 'baseline'));
            const expected = await tree(join(work, 'baseline'));
            expect(expected['index.html']).toContain('A_DATA');
            await run('prepare', source, prepared);
            expect(await readFile(join(prepared, 'conditional/a.yaml'), 'utf8')).toBe('A_DATA\n');
            await expect(access(join(prepared, 'conditional/z.yaml'))).rejects.toThrow();
            expect(await tree(source)).toEqual(original);
            await rename(source, join(work, 'unavailable'));
            await rename(prepared, join(work, 'moved'));
            await run('build', join(work, 'moved'), join(work, 'rebuilt'));
            expect(await tree(join(work, 'rebuilt'))).toEqual(expected);
        },
    );

    test('retains failed copied-readlink provenance and directory visibility before a later merge', async () => {
        await files(source, {
            '.yfm': 'extensions: [./before-merge.cjs]\n',
            'toc.yaml':
                'items:\n  - href: index.md\n  - include: {path: merge/fragment.yaml, mode: merge}\n',
            'index.md': '# Readlink before merge\n',
            'target.yaml': 'original file target\n',
            'target-dir/only.yaml': 'original directory witness\n',
            'merge/fragment.yaml': 'items:\n  - href: merged.md\n',
            'merge/merged.md': '# Merged\n',
            'merge/alias.yaml': 'later file replacement\n',
            'merge/alias-dir/replacement.yaml': 'later directory replacement\n',
            'conditional/EINVAL-EINVAL.yaml': 'READLINK_BEFORE_MERGE_NATIVE\n',
            'before-merge.cjs': `const fs = require('node:fs');
const {getHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/program/index.js'))});
const {getHooks: markdownHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/markdown/index.js'))});
const {getHooks: tocHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/toc/index.js'))});
exports.Extension = class {apply(program) {getHooks(program).BeforeAnyRun.tap('BeforeMerge', run => {
 if (!run.markdown) return;
 let codes;
 tocHooks(run.toc).Item.tap('ReadlinkBeforeMerge', item => {
  if (item.include?.path === 'merge/fragment.yaml') codes = ['alias.yaml', 'alias-dir'].map(path => {
   try {fs.readlinkSync(run.input + '/' + path); return 'LINK';} catch (error) {return error.code;}
  }).join('-');
  return item;
 });
 markdownHooks(run.markdown).Loaded.tap('ReadlinkResult', (_content, meta) => {
  meta.title = fs.readFileSync(run.input + '/conditional/' + codes + '.yaml', 'utf8').trim();
  if (!fs.readFileSync(run.input + '/alias.yaml', 'utf8').includes('later file')) throw new Error('File replacement missing');
  if (!fs.readFileSync(run.input + '/alias-dir/replacement.yaml', 'utf8').includes('later directory')) throw new Error('Directory replacement missing');
 });
});}};
`,
        });
        await symlink('target.yaml', join(source, 'alias.yaml'));
        await symlink('target-dir', join(source, 'alias-dir'));
        const original = await tree(source);
        await run('build', source, join(work, 'baseline'));
        const expected = await tree(join(work, 'baseline'));
        expect(expected['index.html']).toContain('READLINK_BEFORE_MERGE_NATIVE');
        await run('prepare', source, prepared);
        expect(await readlink(join(prepared, 'alias.yaml'))).toBe('target.yaml');
        expect(await readlink(join(prepared, 'alias-dir'))).toBe('target-dir');
        expect(await readFile(join(prepared, 'target.yaml'), 'utf8')).toBe(
            'original file target\n',
        );
        expect(await readFile(join(prepared, 'target-dir/only.yaml'), 'utf8')).toBe(
            'original directory witness\n',
        );
        expect(await tree(source)).toEqual(original);
        await rename(source, join(work, 'unavailable'));
        await rename(prepared, join(work, 'moved'));
        await run('build', join(work, 'moved'), join(work, 'rebuilt'));
        expect(await tree(join(work, 'rebuilt'))).toEqual(expected);
    });

    test.each(['callback', 'promise'])(
        'delivers missing staged readFile/access/open errors through native %s channels',
        async (api) => {
            await files(source, {
                '.yfm': 'extensions: [./async-errors.cjs]\n',
                'toc.yaml': 'items:\n  - href: index.md\n',
                'index.md': '# Missing async inputs\n',
                'async-errors.cjs': `const fs = require('node:fs');
const {getHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/program/index.js'))});
const {getHooks: markdownHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/markdown/index.js'))});
async function missing(name, path) {
 if (${JSON.stringify(api)} === 'promise') {
  let result; try {result = fs.promises[name](path);} catch {return 'THREW';}
  try {await result; return 'PRESENT';} catch (error) {return error.code;}
 }
 return new Promise(resolve => {
  try {fs[name](path, error => resolve(error?.code || 'PRESENT'));} catch {resolve('THREW');}
 });
}
exports.Extension = class {apply(program) {getHooks(program).BeforeAnyRun.tap('AsyncErrors', run => {
 if (!run.markdown) return;
 markdownHooks(run.markdown).Loaded.tapPromise('AsyncErrors', async (_content, meta) => {
  meta.title = (await Promise.all(['readFile', 'access', 'open'].map(async name => name + ':' + await missing(name, run.input + '/absent.yaml')))).join(' ');
 });
});}};
`,
            });
            const original = await tree(source);
            await run('build', source, join(work, 'baseline'));
            const expected = await tree(join(work, 'baseline'));
            for (const name of ['readFile', 'access', 'open'])
                expect(expected['index.html']).toContain(`${name}:ENOENT`);
            await run('prepare', source, prepared);
            expect(await tree(source)).toEqual(original);
            await rename(source, join(work, 'unavailable'));
            await rename(prepared, join(work, 'moved'));
            await run('build', join(work, 'moved'), join(work, 'rebuilt'));
            expect(await tree(join(work, 'rebuilt'))).toEqual(expected);
        },
    );

    test.each(['eligible', 'copy-ignored'])(
        'uses only eligible selected directory-link targets for witness coverage: %s',
        async (selection) => {
            await files(source, {
                '.yfm': 'extensions: [./alias-witness.cjs]\n',
                'toc.yaml': 'items:\n  - href: index.md\n',
                'index.md': '# {{ original }}\n',
                'real-dir/a-unused.yaml': 'unneeded fallback\n',
                ...(selection === 'eligible'
                    ? {'real-dir/z-selected.yaml': 'selected target bytes\n'}
                    : {'real-dir/node_modules/z-selected.yaml': 'selected ignored target bytes\n'}),
                'alias-witness.cjs': `const fs = require('node:fs');
const {getHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/program/index.js'))});
const {getHooks: markdownHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/markdown/index.js'))});
exports.Extension = class {apply(program) {
 getHooks(program).Config.tap('OriginalTarget', config => {
  config.vars = {...config.vars, original: ${JSON.stringify(selection)} === 'copy-ignored' ? fs.readFileSync(config.input + '/real-dir/node_modules/z-selected.yaml', 'utf8').trim() : 'Alias directory witness'};
  return config;
 });
 getHooks(program).BeforeAnyRun.tap('AliasWitness', run => {
 if (!run.markdown) return;
 markdownHooks(run.markdown).Loaded.tap('AliasWitness', (_content, meta) => {
  meta.title = fs.existsSync(run.input + '/alias-dir') ? 'ALIAS_PRESENT' : 'ALIAS_ABSENT';
  if (${JSON.stringify(selection)} === 'eligible') fs.readFileSync(run.input + '/real-dir/z-selected.yaml');
 });
});}};
`,
            });
            await symlink('real-dir', join(source, 'alias-dir'));
            const original = await tree(source);
            await run('build', source, join(work, 'baseline'));
            const expected = await tree(join(work, 'baseline'));
            expect(expected['index.html']).toContain('ALIAS_PRESENT');
            await run('prepare', source, prepared);
            expect(await readlink(join(prepared, 'alias-dir'))).toBe('real-dir');
            if (selection === 'eligible') {
                expect(await readFile(join(prepared, 'real-dir/z-selected.yaml'), 'utf8')).toBe(
                    'selected target bytes\n',
                );
                await expect(access(join(prepared, 'real-dir/a-unused.yaml'))).rejects.toThrow();
            } else {
                expect(
                    await readFile(join(prepared, 'real-dir/node_modules/z-selected.yaml'), 'utf8'),
                ).toBe('selected ignored target bytes\n');
                expect(await readFile(join(prepared, 'real-dir/a-unused.yaml'), 'utf8')).toBe(
                    'unneeded fallback\n',
                );
            }
            expect(await tree(source)).toEqual(original);
            await rename(source, join(work, 'unavailable'));
            await rename(prepared, join(work, 'moved'));
            await run('build', join(work, 'moved'), join(work, 'rebuilt'));
            expect(await tree(join(work, 'rebuilt'))).toEqual(expected);
        },
    );

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
            ])
                await expect(access(join(prepared, path)), path).rejects.toThrow();
            for (const path of [
                'presets.yaml',
                'second/same.md',
                'first/first.md',
                'second/second.md',
                'linked/presets.yaml',
            ])
                await access(join(prepared, path));
            await rename(source, join(work, 'unavailable'));
            await run('build', prepared, join(work, 'rebuilt'), flags);
            expect(await tree(join(work, 'rebuilt'))).toEqual(expected);
        },
    );

    test('preserves copied source metadata when an includer hook overwrites its staged bytes', async () => {
        await files(source, {
            '.yfm': 'extensions: [./generated.cjs]\n',
            'toc.yaml': 'items:\n  - include: {path: source/fragment.yaml, mode: merge}\n',
            'source/fragment.yaml': 'items:\n  - href: page.md\n',
            'source/page.md': '# Copied source\n',
            'generated.cjs': `const {getHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/program/index.js'))});
const {getHooks: tocHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/toc/index.js'))});
exports.Extension = class {apply(program) {
 getHooks(program).BeforeAnyRun.tap('GeneratedShadow', run => {
  tocHooks(run.toc).Included.tapPromise('GeneratedShadow', async () => {await run.write(run.input + '/page.md', '# Generated shadow\\n', true);});
 });
 getHooks(program).AfterAnyRun.tapPromise('GeneratedShadow', async run => {await run.write(run.output + '/provenance.json', JSON.stringify({sourcePath: run.meta.get('page.md').sourcePath}), true);});
}};
`,
        });
        await run('build', source, join(work, 'baseline'));
        expect(JSON.parse(await readFile(join(work, 'baseline/provenance.json'), 'utf8'))).toEqual({
            sourcePath: 'source/page.md',
        });
        await run('prepare', source, prepared);
        expect(await readFile(join(prepared, 'source/page.md'), 'utf8')).toBe('# Copied source\n');
        await expect(access(join(prepared, 'page.md'))).rejects.toThrow();
        await rename(source, join(work, 'unavailable'));
        await run('build', prepared, join(work, 'rebuilt'));
        expect(await tree(join(work, 'rebuilt'))).toEqual(await tree(join(work, 'baseline')));
    });

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
        for (const path of required)
            expect(await readFile(join(prepared, path), 'utf8')).toBe(
                await readFile(join(source, path), 'utf8'),
            );
        for (const path of [
            'comment.html',
            'code.html',
            'escaped.html',
            'template.html',
            'script-fake.html',
            'script-file-fake.html',
            'unused.html',
            'remote-base-only.svg',
        ])
            await expect(access(join(prepared, path))).rejects.toThrow();
        expect(await tree(source)).toEqual(original);
        await rename(source, join(work, 'unavailable'));
        await run('build', prepared, join(work, 'rebuilt'), flags);
        const expected = await tree(join(work, 'baseline'));
        const rebuilt = await tree(join(work, 'rebuilt'));
        expect(rebuilt['pages/index.html']).toBe(expected['pages/index.html']);
        for (const path of required) expect(rebuilt[path]).toBe(expected[path]);
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
        for (const path of ['text-label.html', 'text-description.html'])
            await expect(access(join(prepared, path))).rejects.toThrow();
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
            if (iframe) await access(join(prepared, 'viewer.html'));
            else await expect(access(join(prepared, 'viewer.html'))).rejects.toThrow();
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

    test('preserves external config and config-relative extension dependencies', async () => {
        await files(source, {
            'toc.yaml': 'items:\n  - href: index.md\n',
            'index.md': '# {{ heading }}\n',
        });
        await files(work, {
            'settings/project.yaml':
                'extensions:\n  - ../plugins/title.cjs\nbuild:\n  vars: {heading: Config}\n',
            'plugins/message.json': '{"heading":"External heading"}',
            'plugins/title.cjs': `const {getHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/program/index.js'))});
const message = require('./message.json');
exports.Extension = class {apply(program) {getHooks(program).Config.tap('Fixture', config => {config.vars = {...config.vars, heading: message.heading}; return config;});}};
`,
        });
        const config = join(work, 'settings/project.yaml');
        await run('build', source, join(work, 'baseline'), ['-c', config]);
        const result = await run('prepare', source, prepared, ['-c', config]);
        expect(result.stdout).toContain(join(prepared, 'source'));
        for (const directory of ['source', 'settings', 'plugins'])
            await rename(join(work, directory), join(work, `${directory}-unavailable`));
        await run('build', join(prepared, 'source'), join(work, 'rebuilt'), [
            '-c',
            join(prepared, 'settings/project.yaml'),
        ]);
        expect(await tree(join(work, 'rebuilt'))).toEqual(await tree(join(work, 'baseline')));
    });

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
exports.Extension = class {apply(program) {getHooks(program).Config.tap('MetadataFixture', config => {let heading; try {heading = 'SIZE' + fs.statSync(__dirname + '/decision.yaml').size;} catch {heading = 'MISSING';} config.vars = {...config.vars, heading}; return config;});}};
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
        for (const used of ['spec.yaml', 'models.yaml', 'custom.md'])
            await access(join(prepared, used));
        for (const unused of ['unused.md', 'unused.yaml'])
            await expect(access(join(prepared, unused))).rejects.toThrow();
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

    test.each(['sync', 'callback', 'promise'])(
        'rejects staged opendir %s instead of publishing an incomplete artifact',
        async (kind) => {
            const open = {
                sync: `const dir = fs.opendirSync(run.input); let entry; let found = false;
try {while ((entry = dir.readSync())) if (entry.name === 'marker.yaml') found = true;} finally {dir.closeSync();}`,
                callback: `const dir = await new Promise((resolve, reject) => fs.opendir(run.input, (error, value) => error ? reject(error) : resolve(value)));
let found = false; for await (const entry of dir) if (entry.name === 'marker.yaml') found = true;`,
                promise: `const dir = await fs.promises.opendir(run.input);
let found = false; for await (const entry of dir) if (entry.name === 'marker.yaml') found = true;`,
            }[kind];
            await files(source, {
                '.yfm': 'extensions: [./listing.cjs]\n',
                'toc.yaml': 'items:\n  - href: index.md\n',
                'index.md': '# Native directory iteration\n',
                'marker.yaml': 'present: true\n',
                'listing.cjs': `const fs = require('node:fs');
const {getHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/program/index.js'))});
const {getHooks: markdownHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/markdown/index.js'))});
exports.Extension = class {apply(program) {getHooks(program).BeforeAnyRun.tap('DirectoryIteration', run => {
 markdownHooks(run.markdown).Loaded.tapPromise('DirectoryIteration', async () => {
  fs.mkdirSync(run.input, {recursive: true});
  ${open}
  if (!found) throw Error('Native marker missing');
  console.log('OPENDIR_MARKER=true');
 });
});}};
`,
            });
            const original = await tree(source);
            const baseline = await run('build', source, join(work, 'baseline'));
            expect(baseline.stdout).toContain('OPENDIR_MARKER=true');
            const result = await TestAdapter.runner.runRaw([
                'prepare',
                '-i',
                source,
                '-o',
                prepared,
                ...FLAGS,
            ]);
            expect(result.code).not.toBe(0);
            expect(result.stderr).toContain(
                'opendir of the prepare staging overlay is unsupported',
            );
            await expect(access(prepared)).rejects.toThrow();
            expect(await tree(source)).toEqual(original);
        },
    );

    test.each(['opendir', 'recursive readdir'])(
        'rejects caught unsupported staged %s instead of accepting changed metadata',
        async (api) => {
            const read =
                api === 'opendir'
                    ? `for await (const entry of await fs.promises.opendir(run.input)) if (entry.name === 'marker.yaml') found = true;`
                    : `found = (await fs.promises.readdir(run.input, {recursive: true})).includes('marker.yaml');`;
            await files(source, {
                '.yfm': 'extensions: [./caught.cjs]\n',
                'toc.yaml': 'items:\n  - href: index.md\n',
                'index.md': '# Directory-dependent metadata\n',
                'marker.yaml': 'present: true\n',
                'caught.cjs': `const fs = require('node:fs');
const {getHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/program/index.js'))});
const {getHooks: markdownHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/markdown/index.js'))});
exports.Extension = class {apply(program) {getHooks(program).BeforeAnyRun.tap('CaughtDirectoryRead', run => {
 markdownHooks(run.markdown).Loaded.tapPromise('CaughtDirectoryRead', async (_content, meta) => {
  fs.mkdirSync(run.input, {recursive: true});
  let found = false;
  try {${read}} catch {}
  meta.description = 'DIRECTORY_MARKER_' + found;
  console.log('DIRECTORY_MARKER=' + found);
 });
});}};
`,
            });
            const original = await tree(source);
            const baseline = await run('build', source, join(work, 'baseline'));
            expect(baseline.stdout).toContain('DIRECTORY_MARKER=true');
            const result = await TestAdapter.runner.runRaw([
                'prepare',
                '-i',
                source,
                '-o',
                prepared,
                ...FLAGS,
            ]);
            expect(result.code).not.toBe(0);
            expect(result.stdout).toContain('DIRECTORY_MARKER=false');
            expect(result.stderr).toContain('Prepare cannot reproduce selected filesystem reads');
            expect(result.stderr).toContain('unsupported');
            await expect(access(prepared)).rejects.toThrow();
            expect(await tree(source)).toEqual(original);
        },
    );

    test('preserves enumeration-only files and empty directories through native Node directory APIs', async () => {
        await files(source, {
            '.yfm': 'extensions: [./listing.cjs]\n',
            'toc.yaml': 'items:\n  - href: index.md\n',
            'index.md': '# {{ heading }}\n',
            'listing.cjs': `const {getHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/program/index.js'))});
const fs = require('node:fs');
exports.Extension = class {apply(program) {getHooks(program).Config.tapPromise('ListingFixture', async config => {
 const base = config.input + '/.enum/';
 const found = [];
 found.push(fs.readdirSync(base + 'sync', {encoding: 'buffer'}).some(name => name.toString() === 'marker.yaml'));
 const callbacks = await new Promise((resolve, reject) => fs.readdir(base + 'callback', {withFileTypes: true}, (error, entries) => error ? reject(error) : resolve(entries)));
 found.push(callbacks.some(entry => entry.name === 'marker.yaml'));
 const recursive = await fs.promises.readdir(base + 'promise', {recursive: true, withFileTypes: true});
 found.push(recursive.some(entry => entry.name === 'marker.yaml'));
 const sync = fs.opendirSync(base + 'dir-sync'); let entry; let exists = false;
 try {while ((entry = sync.readSync())) if (entry.name === 'marker.yaml') exists = true;} finally {sync.closeSync();}
 found.push(exists);
 const callback = await new Promise((resolve, reject) => fs.opendir(base + 'dir-callback', (error, dir) => error ? reject(error) : resolve(dir)));
 exists = false;
 try {while ((entry = await new Promise((resolve, reject) => callback.read((error, value) => error ? reject(error) : resolve(value))))) if (entry.name === 'marker.yaml') exists = true;} finally {await callback.close();}
 found.push(exists);
 exists = false;
 for await (const value of await fs.promises.opendir(base + 'dir-promise')) if (value.name === 'marker.yaml') exists = true;
 found.push(exists);
 config.vars = {...config.vars, heading: found.every(Boolean) ? 'PRESENT' : 'ABSENT'}; return config;
});}};
`,
        });
        for (const name of [
            'sync',
            'callback',
            'promise/sub',
            'dir-sync',
            'dir-callback',
            'dir-promise',
        ]) {
            await files(source, {[`.enum/${name}/marker.yaml`]: 'present: true\n'});
            await mkdir(join(source, '.enum', name, 'empty'));
        }
        await run('build', source, join(work, 'baseline'));
        await run('prepare', source, prepared);
        for (const name of [
            'sync',
            'callback',
            'promise/sub',
            'dir-sync',
            'dir-callback',
            'dir-promise',
        ]) {
            await access(join(prepared, '.enum', name, 'marker.yaml'));
            await access(join(prepared, '.enum', name, 'empty'));
        }
        await rename(source, join(work, 'unavailable'));
        await run('build', prepared, join(work, 'rebuilt'));
        expect(await tree(join(work, 'rebuilt'))).toEqual(await tree(join(work, 'baseline')));
    });

    test.each(['Config', 'BeforeAnyRun'])(
        'rejects original-source deletion during %s before mutation, including dry runs',
        async (hook) => {
            await files(source, {
                '.yfm': 'extensions: [./delete.cjs]\n',
                'toc.yaml': 'items:\n  - href: index.md\n',
                'index.md': '# Valid\n',
                'victim.yaml': 'valuable: original\n',
                'delete.cjs': `const {getHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/program/index.js'))});
const fs = require('node:fs');
exports.Extension = class {apply(program) {getHooks(program).${hook}.tapPromise('DeletionFixture', async value => {fs.rmSync(${hook === 'Config' ? 'value.input' : 'value.originalInput'} + '/victim.yaml', {force: true}); return value;});}};
`,
            });
            const result = await TestAdapter.runner.runRaw([
                'prepare',
                '-i',
                source,
                '-o',
                prepared,
                '--dry-run',
                ...FLAGS,
            ]);
            expect(result.code).not.toBe(0);
            expect(result.stderr).toContain('cannot modify original sources');
            expect(await readFile(join(source, 'victim.yaml'), 'utf8')).toBe(
                'valuable: original\n',
            );
            await expect(access(prepared)).rejects.toThrow();
        },
    );
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

    test('rejects a swallowed source-mutation error instead of reporting successful preparation', async () => {
        await files(source, {
            '.yfm': 'extensions: [./delete.cjs]\n',
            'toc.yaml': 'items:\n  - href: index.md\n',
            'index.md': '# Valid\n',
            'victim.yaml': 'valuable: original\n',
            'delete.cjs': `const {getHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/program/index.js'))});
exports.Extension = class {apply(program) {getHooks(program).BeforeAnyRun.tapPromise('SwallowedMutation', async run => {await run.remove(run.originalInput + '/victim.yaml');});}};
`,
        });
        const result = await TestAdapter.runner.runRaw([
            'prepare',
            '-i',
            source,
            '-o',
            prepared,
            '--dry-run',
            ...FLAGS,
        ]);
        expect(result.code).not.toBe(0);
        expect(result.stderr).toContain('cannot modify original sources');
        expect(await readFile(join(source, 'victim.yaml'), 'utf8')).toBe('valuable: original\n');
        await expect(access(prepared)).rejects.toThrow();
    });

    test('does not publish an artifact after a swallowed parent-only configuration mutation', async () => {
        await files(source, {
            '.yfm': 'extensions: [./delete.cjs]\n',
            'toc.yaml': 'items:\n  - href: index.md\n',
            'index.md': '# Valid\n',
            'victim.yaml': 'valuable: original\n',
            'delete.cjs': `const {getHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/program/index.js'))});
const fs = require('node:fs');
exports.Extension = class {apply(program) {getHooks(program).Config.tap('ParentOnlyMutation', config => {if (!process.env.YFM_PREPARE_TRACE) {try {fs.rmSync(config.input + '/victim.yaml', {force: true});} catch {}} return config;});}};
`,
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
        expect(result.stderr).toContain('cannot modify original sources');
        expect(await readFile(join(source, 'victim.yaml'), 'utf8')).toBe('valuable: original\n');
        await expect(access(prepared)).rejects.toThrow();
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
exports.Extension = class {apply(program) {getHooks(program).Config.tap('SourceLinks', config => {const alias = config.input + '/alias.yaml'; const dir = config.input + '/directory'; config.vars = {...config.vars, heading: fs.lstatSync(alias).isSymbolicLink() && fs.readlinkSync(alias) === 'target.yaml' && fs.lstatSync(dir).isSymbolicLink() && fs.readFileSync(dir + '/value.yaml', 'utf8').includes('target') ? 'SYMLINK' : 'REGULAR'}; return config;});}};
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
        'rejects an observed %s symlink before publishing an inequivalent artifact',
        async (kind) => {
            await files(source, {
                '.yfm': 'extensions: [./links.cjs]\n',
                'toc.yaml': 'items:\n  - href: index.md\n',
                'index.md': '# {{ heading }}\n',
                'target.yaml': 'valuable: linked\n',
                'links.cjs': `const {getHooks} = require(${JSON.stringify(resolve(__dirname, '../../lib/program/index.js'))});
const fs = require('node:fs');
exports.Extension = class {apply(program) {getHooks(program).Config.tap('SourceLinks', config => {config.vars = {...config.vars, heading: fs.lstatSync(config.input + '/../alias.yaml').isSymbolicLink() ? 'SYMLINK' : 'REGULAR'}; return config;});}};
`,
            });
            let target = 'missing.yaml';
            if (kind === 'cyclic') target = 'alias.yaml';
            if (kind === 'absolute') target = join(source, 'target.yaml');
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
            expect(result.stderr).toContain('Cannot relocate an observed');
            await expect(access(prepared)).rejects.toThrow();
            expect((await lstat(join(work, 'alias.yaml'))).isSymbolicLink()).toBe(true);
        },
    );
});
