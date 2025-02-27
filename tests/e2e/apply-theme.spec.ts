import {getTestPaths, runYfmDocs, compareDirectories} from '../utils';

const generateMapTestTemplate = (testTitle: string, testRootPath: string, {md2md = true, md2html = true, args = ''}) => {
    test(testTitle, () => {
        const {inputPath, outputPath} = getTestPaths(testRootPath);
        runYfmDocs(inputPath, outputPath, {md2md, md2html, args});
        compareDirectories(outputPath);
    });
}

describe('Build themer feature', () => {
    describe('Apply theme', () => {
        generateMapTestTemplate('md2md with theme yaml', 'mocks/apply-theme/md2md-with-theme-yaml', {
            md2html: false,
        });

        generateMapTestTemplate(
            'md2html with theme yaml',
            'mocks/apply-theme/md2html-with-theme-yaml',
            {
                md2md: false,
            },
        );
    });


});
