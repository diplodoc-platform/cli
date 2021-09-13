const {readFileSync} = require('fs');
const shell = require('shelljs');
const {resolve, join, extname} = require('path');
const walkSync = require('walk-sync');
const {load} = require('js-yaml');
const isEqual = require('lodash/isEqual');
const yfmDocsPath = require.resolve('../build');

function isEqualDirectories({
    expectedOutputPath,
    outputPath,
}) {
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

            let preparedExpectedContent = expectedContent;
            let preparedOutputContent = outputContent;

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

function runYfmDocs({
    inputPath,
    outputPath,
}) {
    shell.rm('-rf', outputPath);
    shell.rm('-rf', `${outputPath}-html`);

    shell.exec(`node ${yfmDocsPath} --input ${inputPath} --output ${outputPath} --output-format=md --allowHTML`);
    shell.exec(`node ${yfmDocsPath} --input ${outputPath} --output ${outputPath}-html --allowHTML`);
}

function getTestPaths({testRootPath}) {
    const inputPath = resolve(join(testRootPath, 'input'));
    const outputPath = resolve(join(testRootPath, 'output'));
    const expectedOutputPath = resolve(join(testRootPath, 'expected-output'));

    return {
        inputPath,
        outputPath,
        expectedOutputPath,
    };
}

module.exports = {
    isEqualDirectories,
    runYfmDocs,
    getTestPaths,
};
