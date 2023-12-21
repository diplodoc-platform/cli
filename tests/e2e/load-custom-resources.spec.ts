import {getTestPaths, runYfmDocs, compareDirectories} from '../utils';

const geretateMapTestTemplate = (testTitle: string, testRootPath: string, {md2md = true, md2html = true, args = '--allow-custom-resources'}) => {
    test(testTitle, () => {
        const {inputPath, outputPath, expectedOutputPath} = getTestPaths(testRootPath);
        runYfmDocs(inputPath, outputPath, {md2md, md2html, args});

        const unifyData = (text: string) => text
            // Remove unique id's
            .replace(/"id":"Documentation.+?"|Config.+?"/gm, '')
            // Unify windows & mac data
            .replace(/\\/gm, '/')
            .replace(/\/r\/n|\/r|\/n/gm, '')
            .replace(/\r\n|\r|\n/gm, '')
            .replace(/\/|\\/gm, '')
            .replace(/\s+/gm, ' ')
            .trim()

        const compareResult = compareDirectories(expectedOutputPath, outputPath, unifyData)

        if (typeof compareResult === 'boolean') {
            expect(true).toEqual(compareResult);
        } else {
            const {expectedContent, outputContent} = compareResult;

            expect(expectedContent).toEqual(outputContent);
        }
    });
}

describe('Allow load custom resources', () => {
    geretateMapTestTemplate('md2md with custom resources', 'mocks/load-custom-resources/md2md-with-resources', {md2html: false})

    geretateMapTestTemplate('md2html with custom resources', 'mocks/load-custom-resources/md2html-with-resources', {md2md: false})

    geretateMapTestTemplate('md2html single page with custom resources', 'mocks/load-custom-resources/single-page-with-resources', {md2md: false, args: '--allow-custom-resources --single-page'})
});
