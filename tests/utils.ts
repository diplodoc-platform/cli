import {readFileSync} from 'fs';
import shell from 'shelljs';
import {resolve, join, extname} from 'path';
import walkSync from 'walk-sync';
import {load} from 'js-yaml';
import isEqual from 'lodash/isEqual';
import {convertBackSlashToSlash} from 'utils/path';

const yfmDocsPath = require.resolve('../build');


export function getFileContent(filePath: string) {
    try {
        return readFileSync(filePath, 'utf8');
    } catch {
        return '';
    }
}

export type CompareResult = {
    expectedContent: string;
    outputContent: string;
} | boolean;

export function compareDirectories(expectedOutputPath: string, outputPath: string): CompareResult {
    const filesFromExpectedOutput = walkSync(expectedOutputPath, {
        directories: false,
        includeBasePath: false,
    });
    let compareResult: CompareResult = true;

    filesFromExpectedOutput.forEach((expectedFilePath) => {
        const fileExtension = extname(expectedFilePath);
        const expectedContent = getFileContent(resolve(expectedOutputPath, expectedFilePath));
        const outputContent = getFileContent(resolve(outputPath, expectedFilePath));

        const convertedExpectedContent = convertBackSlashToSlash(expectedContent);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let preparedExpectedContent: any = convertedExpectedContent;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let preparedOutputContent: any = outputContent;

        if (fileExtension === '.yaml') {
            preparedExpectedContent = load(convertedExpectedContent);
            preparedOutputContent = load(outputContent);
        }

        if (!isEqual(preparedExpectedContent, preparedOutputContent)) {
            compareResult = {
                expectedContent: preparedExpectedContent,
                outputContent: preparedOutputContent,
            };
        }
    });

    return compareResult;
}

export function compareFiles(outputPath, expectedOutputPath) {
    let compareResult: CompareResult = true;
    const expectedContent = getFileContent(expectedOutputPath);
    const outputContent = getFileContent(outputPath);

    const convertedExpectedContent = convertBackSlashToSlash(expectedContent);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let preparedExpectedContent: any = convertedExpectedContent;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let preparedOutputContent: any = outputContent;

    if (!isEqual(preparedExpectedContent, preparedOutputContent)) {
        compareResult = {
            expectedContent: preparedExpectedContent,
            outputContent: preparedOutputContent,
        };
    }

    return compareResult
}

interface RunYfmDocsArgs {
    md2md?: boolean;
    md2html?: boolean;
    args?: string
}

export function runYfmDocs(inputPath: string, outputPath: string, {md2md=true, md2html=true, args = ''}: RunYfmDocsArgs = {}): void {
    shell.rm('-rf', outputPath);

    if (md2md && md2html) {
        shell.rm('-rf', `${outputPath}-html`);

        shell.exec(`node ${yfmDocsPath} --input ${inputPath} --output ${outputPath} --output-format=md --allowHTML --quiet ${args}`);
        shell.exec(`node ${yfmDocsPath} --input ${outputPath} --output ${outputPath}-html --allowHTML --quiet ${args}`);
    } else if (md2md) {
        shell.exec(`node ${yfmDocsPath} --input ${inputPath} --output ${outputPath} --output-format=md --allowHTML --quiet ${args}`);
    } else {
        shell.exec(`node ${yfmDocsPath} --input ${inputPath} --output ${outputPath} --allowHTML --quiet ${args}`);
    }
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
