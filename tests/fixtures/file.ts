import type {BuildRunArgs} from './cli';

import {readFileSync} from 'node:fs';
import {rm} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {glob} from 'glob';
import {expect, test} from 'vitest';

import {TestAdapter} from './cli';
import {bundleless, hashless, platformless} from './test';

const SYSTEM_DIRS = ['_bundle/', '_search/'];

// CLI-emitted build artifacts that aren't part of user content. Build-stats
// and build-content default to on for md2md, so every md2md fixture would
// otherwise need to list these in its snapshot.
const SYSTEM_ARTIFACTS = [
    'yfm-build-manifest.json',
    'yfm-build-stats.json',
    'yfm-build-content.json',
];

export function getFileContent(filePath: string) {
    return platformless(bundleless(readFileSync(filePath, 'utf8')));
}

const uselessFile = (file: string, dirs: string[]) => !dirs.some((part) => file.includes(part));

export function stripSystemLinks(content: string) {
    const dirPattern = SYSTEM_DIRS.map((d) => d.replace('/', '\\/')).join('|');

    content = content.replace(
        new RegExp(`<script[^>]+src="(?:${dirPattern})[^"]*"[^>]*></script>`, 'g'),
        '',
    );

    content = content.replace(
        new RegExp(`<link[^>]+href="(?:${dirPattern})[^"]*"[^>]*\\/?>`, 'g'),
        '',
    );

    content = content.replace(
        new RegExp(
            `<meta http-equiv="last-modified" content="\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z">`,
            'g',
        ),
        '<meta http-equiv="last-modified" content="2025-10-15T00:00:00.000Z">',
    );

    content = content.replace(
        new RegExp(
            `<meta property="article:modified_time" content="\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z">`,
            'g',
        ),
        '<meta property="article:modified_time" content="2025-10-15T00:00:00.000Z">',
    );

    content = content.replace(
        new RegExp(`"updatedAt":"\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z"`, 'g'),
        '"updatedAt":"2025-10-15T00:00:00.000Z"',
    );

    content = content.replace(/^[ \t]*\r?\n/gm, '');

    return content;
}

export async function compareDirectories(
    outputPath: string,
    ignoreFileContent = false,
    checkBundle = false,
    ignoreFileList = false,
) {
    const filesFromOutput = (
        await glob(`**/*`, {
            cwd: outputPath,
            dot: true,
            follow: true,
            nodir: true,
            posix: true,
        })
    ).sort();

    let filesForSnapshot;

    if (checkBundle) {
        filesForSnapshot = filesFromOutput;
    } else {
        filesForSnapshot = filesFromOutput.filter((file) =>
            uselessFile(file, [...SYSTEM_DIRS, ...SYSTEM_ARTIFACTS]),
        );
    }

    // Here we sort the order of the included files after all processing
    // This is necessary for better test stability
    // We do not care in what order these files were received and processed
    // We sort only the final list and put it in the snapshot.
    // `bundleless` strips dynamic (numeric-id) client chunks → drop the now-empty
    // entries so they don't appear in the file list snapshot.
    filesForSnapshot = filesForSnapshot.map(bundleless).map(hashless).filter(Boolean).sort();

    if (!ignoreFileList) {
        expect(JSON.stringify(filesForSnapshot, null, 2)).toMatchSnapshot('filelist');
    }

    if (!ignoreFileContent) {
        filesFromOutput
            .filter((file) => uselessFile(file, ['_assets/', ...SYSTEM_DIRS, ...SYSTEM_ARTIFACTS]))
            .forEach((filePath) => {
                let content = getFileContent(resolve(outputPath, filePath));

                if (!checkBundle && filePath.endsWith('.html')) {
                    content = stripSystemLinks(content);
                }

                expect(content).toMatchSnapshot();
            });
    }
}

type TestPaths = {
    inputPath: string;
    outputPath: string;
};

export function getTestPaths(testRootPath: string): TestPaths {
    return {
        inputPath: resolve(__dirname, '../', join(testRootPath, 'input')),
        outputPath: resolve(__dirname, '../', join(testRootPath, 'output')),
    };
}

export function cleanupDirectory(path: string) {
    return rm(path, {recursive: true, force: true});
}

export function generateMapTestTemplate(
    testTitle: string,
    testRootPath: string,
    options: BuildRunArgs = {},
) {
    test(testTitle, async () => {
        const {inputPath, outputPath} = getTestPaths(testRootPath);

        await TestAdapter.testBuildPass(inputPath, outputPath, options);
        await compareDirectories(outputPath);
    });
}
