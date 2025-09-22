import {readFileSync} from 'node:fs';
import {rm} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {glob} from 'glob';
import {expect} from 'vitest';

import {bundleless, hashless, platformless} from './test';

const SYSTEM_DIRS = ['_bundle/', '_search/'];

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

    content = content.replace(/^[ \t]*\r?\n/gm, '');

    return content;
}

export async function compareDirectories(
    outputPath: string,
    ignoreFileContent = false,
    checkBundle = false,
) {
    const filesFromOutput = (
        await glob(`**/*`, {
            cwd: outputPath,
            dot: true,
            follow: true,
            nodir: true,
            posix: true,
        })
    )
        .map(bundleless)
        .sort();

    let filesForSnapshot;

    if (checkBundle) {
        filesForSnapshot = filesFromOutput;
    } else {
        filesForSnapshot = filesFromOutput.filter((file) => uselessFile(file, SYSTEM_DIRS));
    }

    // Here we sort the order of the included files after all processing
    // This is necessary for better test stability
    // We do not care in what order these files were received and processed
    // We sort only the final list and put it in the snapshot
    filesForSnapshot = filesForSnapshot.map(hashless).sort();

    expect(JSON.stringify(filesForSnapshot, null, 2)).toMatchSnapshot('filelist');

    if (!ignoreFileContent) {
        filesFromOutput
            .filter((file) => uselessFile(file, ['_assets/', ...SYSTEM_DIRS]))
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
        inputPath: resolve(__dirname, '../../', join(testRootPath, 'input')),
        outputPath: resolve(__dirname, '../../', join(testRootPath, 'output')),
    };
}

export function cleanupDirectory(path: string) {
    return rm(path, {recursive: true, force: true});
}
