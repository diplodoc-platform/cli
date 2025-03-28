import {readFileSync} from 'fs';
import {resolve, join} from 'path';
import walkSync from 'walk-sync';
import {bundleless, platformless} from './test';

export function getFileContent(filePath: string) {
    return bundleless(platformless(readFileSync(filePath, 'utf8')));
}

const uselessFile = (file: string) =>
    !['_bundle/', '_assets/', '_search/'].some((part) => file.includes(part));

export function compareDirectories(outputPath: string): void {
    const filesFromOutput = walkSync(outputPath, {
        directories: false,
        includeBasePath: false,
    }).sort();

    expect(bundleless(JSON.stringify(filesFromOutput, null, 2))).toMatchSnapshot('filelist');

    filesFromOutput.filter(uselessFile).forEach((filePath) => {
        const content = getFileContent(resolve(outputPath, filePath));
        expect(content).toMatchSnapshot(filePath);
    });
}

export interface TestPaths {
    inputPath: string;
    outputPath: string;
}

export function getTestPaths(testRootPath: string): TestPaths {
    return {
        inputPath: resolve(join(testRootPath, 'input')),
        outputPath: resolve(join(testRootPath, 'output')),
    };
}
