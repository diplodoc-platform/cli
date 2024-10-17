import {readFileSync} from 'fs';
import shell from 'shelljs';
import {resolve, join} from 'path';
import walkSync from 'walk-sync';

const yfmDocsPath = require.resolve('../build');
const assets = require('@diplodoc/client/manifest');

export function platformless(text: string) {
    return text
        .replace(/\r\n/g, '\n')
        .replace(/(\\(?![\/"'])){1,2}/g, '/')
        .replace(/(Config|Documentation)-\d+-\d+.\d+/g, '$1-RANDOM');
}

export function bundleless(text: string) {
    for (const [entryKey, entry] of Object.entries(assets)) {
        for (const [typeKey, type] of Object.entries(entry)) {
            for (let index = 0; index < type.length; index++) {
                let prev = '';
                while (prev !== text) {
                    prev = text;
                    text = text.replace(type[index], `${entryKey}-${typeKey}-${index}`);
                }
            }
        }
    }

    return text;
}

export function getFileContent(filePath: string) {
    return bundleless(platformless(readFileSync(filePath, 'utf8')));
}

const uselessFile = (file) => !['_bundle/', '_assets/'].some(part => file.includes(part));

export function compareDirectories(outputPath: string) {
    const filesFromOutput = walkSync(outputPath, {
        directories: false,
        includeBasePath: false,
    });

    expect(bundleless(JSON.stringify(filesFromOutput, null, 2))).toMatchSnapshot();

    filesFromOutput
        .filter(uselessFile)
        .forEach((filePath) => {
            const content = getFileContent(resolve(outputPath, filePath));
            expect(content).toMatchSnapshot();
        });
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
}

export function getTestPaths(testRootPath: string): TestPaths {
    return {
        inputPath: resolve(join(testRootPath, 'input')),
        outputPath: resolve(join(testRootPath, 'output')),
    };
}

export function replaceDoubleToSingleQuotes(str: string): string {
    return str.replace(/"/g, "'");
}
