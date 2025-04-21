import {getTestPaths, runYfmDocs, compareDirectories} from '../utils';

const generateMapTestTemplate = (testTitle: string, testRootPath: string, extendedCommand: string) => {
    test(testTitle, () => {
        const {inputPath, outputPath} = getTestPaths(testRootPath);
        runYfmDocs(inputPath, outputPath, {md2html: false, md2md: false, skipDefaults: true}, extendedCommand);
        compareDirectories(outputPath, true);
    });
}

const generateFilesYamlTestTemplate = (testTitle: string, testRootPath: string, extendedCommand: string) => {
    test(testTitle, () => {
        const {inputPath, outputPath} = getTestPaths(testRootPath);
        runYfmDocs(inputPath, outputPath, {md2html: false, md2md: false, skipDefaults: true}, extendedCommand);
        compareDirectories(outputPath);
    });
}

describe('Translate command', () => {
    generateMapTestTemplate('filter files on extract', 'mocks/translation/dir-files', 'translate extract translate extract --source ru-RU --target es-ES')

    generateMapTestTemplate('filter files on extract with extra exclude option', 'mocks/translation/dir-files', 'translate extract --source ru-RU --target es-ES --exclude ru/_no-translate/*.md')

    generateFilesYamlTestTemplate('extract yaml scheme files', 'mocks/translation/yaml-scheme', 'translate extract --source ru-RU --target en-US')
});