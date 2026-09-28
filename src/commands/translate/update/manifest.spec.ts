import {mkdir, mkdtemp, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';

import {loadUpdateManifest} from './manifest';

const roots: string[] = [];
afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});
async function fixture() {
    const root = await mkdtemp(join(tmpdir(), 'translate-update-'));
    roots.push(root);
    await mkdir(join(root, 'output'));
    await writeFile(join(root, 'before.md'), '# Old\n');
    await writeFile(join(root, 'after.md'), '# New\n');
    await writeFile(join(root, 'target.md'), '# Previous\n');
    const entry = {
        kind: 'update',
        sourcePath: 'ru/a.md',
        targetPath: 'en/a.md',
        sourceBeforePath: 'before.md',
        sourceAfterPath: 'after.md',
        targetBeforePath: 'target.md',
    };
    const options = {
        path: join(root, 'manifest.json'),
        inputRoot: root,
        outputRoot: join(root, 'output'),
        sourceLanguage: 'ru',
        targetLanguage: 'en',
    };
    const save = (value: unknown) => writeFile(options.path, JSON.stringify(value));
    await save({schemaVersion: 1, files: [entry]});
    return {root, entry, options, save};
}
describe('update manifest', () => {
    it('loads exact immutable snapshots', async () => {
        const {options} = await fixture();
        expect(await loadUpdateManifest(options)).toMatchObject([
            {sourceBefore: '# Old\n', sourceAfter: '# New\n', targetBefore: '# Previous\n'},
        ]);
    });
    it.each([2, null, '1'])('rejects schema %s', async (schemaVersion) => {
        const {options, entry, save} = await fixture();
        await save({schemaVersion, files: [entry]});
        await expect(loadUpdateManifest(options)).rejects.toThrow(/schemaVersion/);
    });
    it.each(['../escape.md', '/tmp/escape.md'])(
        'rejects escaping snapshot %s',
        async (sourceAfterPath) => {
            const {options, entry, save} = await fixture();
            await save({schemaVersion: 1, files: [{...entry, sourceAfterPath}]});
            await expect(loadUpdateManifest(options)).rejects.toThrow();
        },
    );
    it('rejects duplicate target paths before translation', async () => {
        const {options, entry, save} = await fixture();
        await save({schemaVersion: 1, files: [entry, entry]});
        await expect(loadUpdateManifest(options)).rejects.toThrow(/duplicate/i);
    });
    it('rejects incompatible languages', async () => {
        const {options} = await fixture();
        await expect(loadUpdateManifest({...options, targetLanguage: 'de'})).rejects.toThrow(
            /language/i,
        );
    });
    it('rejects output symlink escape', async () => {
        const {root, options} = await fixture();
        await symlink(root, join(options.outputRoot, 'en'));
        await expect(loadUpdateManifest(options)).rejects.toThrow(/escape/i);
    });
    it('requires an existing target snapshot', async () => {
        const {root, options} = await fixture();
        await rm(join(root, 'target.md'));
        await expect(loadUpdateManifest(options)).rejects.toThrow();
    });
});

it('refuses a create entry over an existing target in the input tree', async () => {
    const {root, options, save} = await fixture();
    await mkdir(join(root, 'en'));
    await writeFile(join(root, 'en/a.md'), 'Human translation');
    await save({
        schemaVersion: 1,
        files: [
            {
                kind: 'create',
                sourcePath: 'ru/a.md',
                targetPath: 'en/a.md',
                sourceAfterPath: 'after.md',
            },
        ],
    });
    await expect(loadUpdateManifest(options)).rejects.toThrow(/exists/);
});
