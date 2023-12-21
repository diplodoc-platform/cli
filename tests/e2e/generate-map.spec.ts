import {getTestPaths, runYfmDocs, getFileContent} from '../utils';
import {join} from 'path';

const geretateMapTestTemplate = (testTitle: string, testRootPath: string, md2md = true, md2html = true) => {
    test(testTitle, () => {
        const {inputPath, outputPath} = getTestPaths(testRootPath);

        runYfmDocs(inputPath, outputPath, {md2md, md2html, args: '--add-map-file'});

        const content = getFileContent(join(outputPath, 'files.json'));

        expect(content).toMatchSnapshot();
    });
}

describe('Generate map for', () => {
    geretateMapTestTemplate('project with single language and toc include', 'mocks/generate-map/test1')

    geretateMapTestTemplate('project with single language and toc include - only md2html', 'mocks/generate-map/test1', false)

    geretateMapTestTemplate('project with multiple language', 'mocks/generate-map/test2')

    geretateMapTestTemplate('project with external links in toc', 'mocks/generate-map/test3')
});
