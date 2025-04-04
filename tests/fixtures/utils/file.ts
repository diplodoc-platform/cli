import {readFileSync} from 'fs';
import {join, resolve} from 'path';
import walkSync from 'walk-sync';
import {bundleless, platformless} from './test';
import {expect} from 'vitest';
import shell from 'shelljs';

export function getFileContent(filePath: string) {
    return bundleless(platformless(readFileSync(filePath, 'utf8')));
}

const uselessFile = (file: string) =>
    !['_bundle/', '_assets/', '_search/'].some((part) => file.includes(part));

export function compareDirectories(outputPath: string, ignoreFileContent = false): void {
    const filesFromOutput = walkSync(outputPath, {
        directories: false,
        includeBasePath: false,
    }).sort();

    expect(bundleless(JSON.stringify(filesFromOutput, null, 2))).toMatchSnapshot('filelist');

    if (!ignoreFileContent) {
        filesFromOutput.filter(uselessFile).forEach((filePath) => {
            const content = getFileContent(resolve(outputPath, filePath));
            expect(content).toMatchSnapshot(filePath);
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

export function cleanupDirectory(path: string): void {
    shell.rm('-rf', path);
}
