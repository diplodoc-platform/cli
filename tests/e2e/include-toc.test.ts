import {compareDirectories, runYfmDocs, getTestPaths} from '../utils';

describe('Include toc', () => {
    test('Toc is included in link mode', () => {
        const {inputPath, outputPath} = getTestPaths('mocks/include-toc/test1');
        runYfmDocs(inputPath, outputPath);
        compareDirectories(outputPath);
    });

    test('Toc is included inline, not as a new section', () => {
        const {inputPath, outputPath} = getTestPaths('mocks/include-toc/test2');
        runYfmDocs(inputPath, outputPath);
        compareDirectories(outputPath);
    });

    test('Nested toc inclusions with mixed including modes', () => {
        const {inputPath, outputPath} = getTestPaths('mocks/include-toc/test3');
        runYfmDocs(inputPath, outputPath);
        compareDirectories(outputPath);
    });

    test('Nested toc inclusions with mixed including modes 2', () => {
        const {inputPath, outputPath} = getTestPaths('mocks/include-toc/test5');
        runYfmDocs(inputPath, outputPath);
        compareDirectories(outputPath);
    });

    test('Toc with expressions', () => {
        const {inputPath, outputPath} = getTestPaths('mocks/include-toc/test4');
        const vars = {
            type: 'a',
            a: 'A',
            b: 'B',
        };
        runYfmDocs(inputPath, outputPath, {
            args: `--vars="${JSON.stringify(vars).replace(/(")/g, '\\$1')}"`,
        });
        compareDirectories(outputPath);
    });

    test('Toc with generic includer', () => {
        const {inputPath, outputPath} = getTestPaths('mocks/include-toc/test6');
        runYfmDocs(inputPath, outputPath);
        compareDirectories(outputPath);
    });
});
