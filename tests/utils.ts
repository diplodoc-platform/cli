import {readFileSync} from 'fs';
import shell from 'shelljs';
import {resolve, join, extname} from 'path';
import walkSync from 'walk-sync';
import {load} from 'js-yaml';
import isEqual from 'lodash/isEqual';

const yfmDocsPath = require.resolve('../build');

export function isEqualDirectories(expectedOutputPath: string, outputPath: string): boolean {
    let isEqualOutput = true;

    const filesFromExpectedOutput = walkSync(expectedOutputPath, {
        directories: false,
        includeBasePath: false,
    });

    filesFromExpectedOutput.forEach((expectedFilePath) => {
        try {
            const fileExtension = extname(expectedFilePath);
            const expectedContent = readFileSync(resolve(expectedOutputPath, expectedFilePath), 'utf8');
            const outputContent = readFileSync(resolve(outputPath, expectedFilePath), 'utf8');

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let preparedExpectedContent: any = expectedContent;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let preparedOutputContent: any = outputContent;

            if (fileExtension === '.yaml') {
                preparedExpectedContent = load(expectedContent);
                preparedOutputContent = load(outputContent);
            }

            if (!isEqual(preparedExpectedContent, preparedOutputContent)) {
                isEqualOutput = false;
            }
        } catch (e) {
            console.error(e);
            isEqualOutput = false;
        }
    });

    return isEqualOutput;
}

export function runYfmDocs(inputPath: string, outputPath: string): void {
    shell.rm('-rf', outputPath);
    shell.rm('-rf', `${outputPath}-html`);

    shell.exec(`node ${yfmDocsPath} --input ${inputPath} --output ${outputPath} --output-format=md --allowHTML --quiet`);
    shell.exec(`node ${yfmDocsPath} --input ${outputPath} --output ${outputPath}-html --allowHTML --quiet`);
}

export interface TestPaths {
    inputPath: string;
    outputPath: string;
    expectedOutputPath: string;
}

export function getTestPaths(testRootPath: string): TestPaths {
    const inputPath = resolve(join(testRootPath, 'input'));
    const outputPath = resolve(join(testRootPath, 'output'));
    const expectedOutputPath = resolve(join(testRootPath, 'expected-output'));

    return {
        inputPath,
        outputPath,
        expectedOutputPath,
    };
}
