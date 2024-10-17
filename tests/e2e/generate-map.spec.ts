import {getTestPaths, runYfmDocs, getFileContent, bundleless} from '../utils';
import {join} from 'path';

const generateMapTestTemplate = (testTitle: string, testRootPath: string, md2md = true, md2html = true) => {
    test(testTitle, () => {
        const {inputPath, outputPath} = getTestPaths(testRootPath);

        runYfmDocs(inputPath, outputPath, {md2md, md2html, args: '--add-map-file'});

        const content = getFileContent(join(outputPath, 'files.json'));

        expect(bundleless(content)).toMatchSnapshot();
    });
}

describe('Generate map for', () => {
    generateMapTestTemplate('project with single language and toc include', 'mocks/generate-map/test1')

    generateMapTestTemplate('project with single language and toc include - only md2html', 'mocks/generate-map/test1', false)

    generateMapTestTemplate('project with multiple language', 'mocks/generate-map/test2')

    generateMapTestTemplate('project with external links in toc', 'mocks/generate-map/test3')
});
