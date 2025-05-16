import {compareDirectories, runYfmDocs, getTestPaths} from '../utils';

describe('Yfm docs-viewer: interface props', () => {
    test('Interface props set - no-toc, no-search, no-feedback, __DATA__ object should contain props in viewerInterface prop', () => {
        const {inputPath, outputPath} = getTestPaths('mocks/docs-viewer-interface');
        runYfmDocs(inputPath, outputPath, {md2md: false, md2html: true});
        compareDirectories(outputPath);
    });
});
