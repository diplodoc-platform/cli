import {describe, expect, test} from 'vitest';
import {cp, mkdtemp, readFile, realpath, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {TestAdapter, getTestPaths} from '../fixtures';

const buildContentTestTemplate = (testTitle: string, testRootPath: string, extraArgs = '') => {
    test(testTitle, async () => {
        const {inputPath, outputPath} = getTestPaths(testRootPath);

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: `--build-content ${extraArgs}`.trim(),
        });

        const contentMap = await readFile(join(outputPath, 'yfm-build-content.json'), 'utf-8');

        expect(JSON.parse(contentMap)).toMatchSnapshot();
    });
};

describe('Build content map for', () => {
    buildContentTestTemplate(
        'project with an include and a picture',
        'mocks/build-content-map/with-includes',
    );

    buildContentTestTemplate(
        'project with autotitle links between pages',
        'mocks/build-content-map/with-autotitles',
    );

    buildContentTestTemplate(
        'nested includes (hashIncludes default, mergeIncludes off)',
        'mocks/build-content-map/nested-includes',
    );

    buildContentTestTemplate(
        'nested includes (mergeIncludes on)',
        'mocks/build-content-map/nested-includes',
        '--merge-includes',
    );

    buildContentTestTemplate(
        'diamond includes (hashIncludes default, mergeIncludes off)',
        'mocks/build-content-map/diamond-includes',
    );

    buildContentTestTemplate(
        'diamond includes (mergeIncludes on)',
        'mocks/build-content-map/diamond-includes',
        '--merge-includes',
    );

    buildContentTestTemplate(
        'autotitle chain (hashIncludes default, mergeIncludes off)',
        'mocks/build-content-map/autotitle-chain',
    );

    buildContentTestTemplate(
        'autotitle chain (mergeIncludes on)',
        'mocks/build-content-map/autotitle-chain',
        '--merge-includes',
    );

    buildContentTestTemplate(
        'autotitle target with include (hashIncludes default, mergeIncludes off)',
        'mocks/build-content-map/autotitle-target-with-include',
    );

    buildContentTestTemplate(
        'autotitle target with include (mergeIncludes on)',
        'mocks/build-content-map/autotitle-target-with-include',
        '--merge-includes',
    );
});

describe('Build content map propagation', () => {
    test('mutating an include propagates to parent hashes (mergeIncludes: false, hashIncludes: true)', async () => {
        const fixtureRoot = getTestPaths('mocks/build-content-map/nested-includes').inputPath;
        // realpath() canonicalizes macOS /var → /private/var symlink so the
        // build's scope checks (which compare against fs.realpath() results)
        // line up with the configured input/output paths.
        const work = await realpath(
            await mkdtemp(join(tmpdir(), 'yfm-build-content-propagation-')),
        );
        const inputBefore = join(work, 'input-before');
        const inputAfter = join(work, 'input-after');
        const before = join(work, 'before');
        const after = join(work, 'after');

        await cp(fixtureRoot, inputBefore, {recursive: true});
        await cp(fixtureRoot, inputAfter, {recursive: true});

        await writeFile(
            join(inputAfter, '_includes/level2.md'),
            '# Level 2 mutated\n\nNew body for the deepest include.\n',
        );

        await TestAdapter.testBuildPass(inputBefore, before, {
            md2md: true,
            md2html: false,
            args: '--build-content',
        });
        await TestAdapter.testBuildPass(inputAfter, after, {
            md2md: true,
            md2html: false,
            args: '--build-content',
        });

        const beforeManifest = JSON.parse(
            await readFile(join(before, 'yfm-build-content.json'), 'utf-8'),
        );
        const afterManifest = JSON.parse(
            await readFile(join(after, 'yfm-build-content.json'), 'utf-8'),
        );

        // level2.md changed → its hash differs
        expect(beforeManifest.contentHashes['_includes/level2.md'].hash).not.toBe(
            afterManifest.contentHashes['_includes/level2.md'].hash,
        );

        // level1.md transitively references level2 via signlink → name change
        // propagates into level1.md's body → its hash differs.
        expect(beforeManifest.contentHashes['_includes/level1.md'].hash).not.toBe(
            afterManifest.contentHashes['_includes/level1.md'].hash,
        );

        // index.md references level1 via signlink → name change cascades → its
        // hash differs.
        expect(beforeManifest.contentHashes['index.md'].hash).not.toBe(
            afterManifest.contentHashes['index.md'].hash,
        );

        // toc.yaml and .yfm are untouched → identical
        expect(beforeManifest.contentHashes['toc.yaml']?.hash).toBe(
            afterManifest.contentHashes['toc.yaml']?.hash,
        );
        expect(beforeManifest.contentHashes['.yfm']?.hash).toBe(
            afterManifest.contentHashes['.yfm']?.hash,
        );
    });

    test('mutating an include propagates to parent hashes (mergeIncludes: true)', async () => {
        const fixtureRoot = getTestPaths('mocks/build-content-map/nested-includes').inputPath;
        const work = await realpath(
            await mkdtemp(join(tmpdir(), 'yfm-build-content-propagation-merge-')),
        );
        const inputBefore = join(work, 'input-before');
        const inputAfter = join(work, 'input-after');
        const before = join(work, 'before');
        const after = join(work, 'after');

        await cp(fixtureRoot, inputBefore, {recursive: true});
        await cp(fixtureRoot, inputAfter, {recursive: true});

        await writeFile(
            join(inputAfter, '_includes/level2.md'),
            '# Level 2 mutated\n\nNew body for the deepest include.\n',
        );

        await TestAdapter.testBuildPass(inputBefore, before, {
            md2md: true,
            md2html: false,
            args: '--build-content --merge-includes',
        });
        await TestAdapter.testBuildPass(inputAfter, after, {
            md2md: true,
            md2html: false,
            args: '--build-content --merge-includes',
        });

        const beforeManifest = JSON.parse(
            await readFile(join(before, 'yfm-build-content.json'), 'utf-8'),
        );
        const afterManifest = JSON.parse(
            await readFile(join(after, 'yfm-build-content.json'), 'utf-8'),
        );

        // With merge: level2.md and level1.md don't exist in output anymore,
        // their content is inlined into index.md.
        expect(beforeManifest.contentHashes['_includes/level2.md']).toBeUndefined();
        expect(afterManifest.contentHashes['_includes/level2.md']).toBeUndefined();
        expect(beforeManifest.contentHashes['_includes/level1.md']).toBeUndefined();
        expect(afterManifest.contentHashes['_includes/level1.md']).toBeUndefined();

        // index.md hash differs because the inlined level2 content changed.
        expect(beforeManifest.contentHashes['index.md'].hash).not.toBe(
            afterManifest.contentHashes['index.md'].hash,
        );

        // toc.yaml and .yfm unchanged.
        expect(beforeManifest.contentHashes['toc.yaml']?.hash).toBe(
            afterManifest.contentHashes['toc.yaml']?.hash,
        );
        expect(beforeManifest.contentHashes['.yfm']?.hash).toBe(
            afterManifest.contentHashes['.yfm']?.hash,
        );
    });
});
