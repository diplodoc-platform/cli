import {getTestPaths, runYfmDocs, getFileContent} from '../utils';

const geretateMapTestTemplate = (testTitle, testRootPath, md2md = true, md2html = true) => {
    test(testTitle, () => {
        const {inputPath, outputPath, expectedOutputPath} = getTestPaths(testRootPath);

        runYfmDocs(inputPath, outputPath, {md2md, md2html, args: '--add-map-file'});

        const outputContent = getFileContent(outputPath + '/files.json');
        const expectedContent = getFileContent(expectedOutputPath + '/files.json');

        const prepareFileJsonToCompare = (file) => JSON.stringify(JSON.parse(file).files.sort())

        expect(prepareFileJsonToCompare(outputContent)).toEqual(prepareFileJsonToCompare(expectedContent));
    });
}

describe('Generate map for', () => {
    geretateMapTestTemplate('project with single language and toc include', 'mocks/generate-map/test1')

    geretateMapTestTemplate('project with single language and toc include - only md2html', 'mocks/generate-map/test1', false)

    geretateMapTestTemplate('project with multiple language', 'mocks/generate-map/test2')

    geretateMapTestTemplate('project with external links in toc', 'mocks/generate-map/test3')
});
