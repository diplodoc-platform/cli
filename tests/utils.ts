import {readFileSync} from 'fs';
import shell from 'shelljs';
import {resolve, join} from 'path';
import walkSync from 'walk-sync';

const yfmDocsPath = require.resolve('../build');
const assets = require('@diplodoc/client/manifest');
const {version} = require('../package.json');

export function platformless(text: string) {
    return text
        .replace(/\r\n/g, '\n')
        .replace(/\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/g, 'UUID')
        .replace(/(\\(?![\/"'])){1,2}/g, '/');
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

const uselessFile = (file) => !['_bundle/', '_assets/', '_search/'].some(part => file.includes(part));

export function compareDirectories(outputPath: string) {
    const filesFromOutput = walkSync(outputPath, {
        directories: false,
        includeBasePath: false,
    }).sort();

    expect(bundleless(JSON.stringify(filesFromOutput, null, 2))).toMatchSnapshot('filelist');

    filesFromOutput
        .filter(uselessFile)
        .forEach((filePath) => {
            const content = getFileContent(resolve(outputPath, filePath))
                // Replace version for meta tag
                .replace(/^(\s+content="Diplodoc.*? )v\d+\.\d+\.\d+"$/g, `$1v${version}"`);
            expect(content).toMatchSnapshot(filePath);
        });
}

interface RunYfmDocsArgs {
    md2md?: boolean;
    md2html?: boolean;
    args?: string
}

export function runYfmDocs(inputPath: string, outputPath: string, {md2md=true, md2html=true, args = ''}: RunYfmDocsArgs = {}): void {
    shell.rm('-rf', outputPath);

    const defaults = ` --quiet --allowHTML`;
    const run = `node ${yfmDocsPath} --input ${inputPath} --output ${outputPath} ${defaults}`;

    if (md2md && md2html) {
        shell.rm('-rf', `${outputPath}-html`);

        logResult(shell.exec(`${run} --output ${outputPath} -f md ${args}`));
        logResult(shell.exec(`${run} --output ${outputPath}-html ${args}`));
    } else if (md2md) {
        logResult(shell.exec(`${run} --output ${outputPath} -f md ${args}`));
    } else {
        logResult(shell.exec(`${run} --output ${outputPath} ${args}`));
    }
}

function logResult(result) {
    if (result.code > 0) {
        console.log('=== STDOUT ===\n' + result.stdout + '\n=== STDERR ===\n' + result.stderr);

        throw result.stderr
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
