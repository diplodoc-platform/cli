import {readFileSync} from 'node:fs';
import {rm} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {glob} from 'glob';
import {bundleless, hashless, platformless} from './test';
import {expect} from 'vitest';

export function getFileContent(filePath: string) {
    return platformless(bundleless(readFileSync(filePath, 'utf8')));
}

const uselessFile = (file: string) =>
    !['_bundle/', '_assets/', '_search/'].some((part) => file.includes(part));

export async function compareDirectories(outputPath: string, ignoreFileContent = false) {
    const filesFromOutput = (
        await glob(`**/*`, {
            cwd: outputPath,
            dot: true,
            follow: true,
            nodir: true,
            posix: true,
        })
    ).map(bundleless).sort();

    expect(hashless(JSON.stringify(filesFromOutput, null, 2))).toMatchSnapshot('filelist');

    if (!ignoreFileContent) {
        filesFromOutput.filter(uselessFile).forEach((filePath) => {
            const content = getFileContent(resolve(outputPath, filePath));
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
