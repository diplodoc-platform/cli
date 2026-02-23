import {describe, expect, test} from 'vitest';

import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

describe('Include with Meta', () => {
    test('Build with PAGE_PROCESS_CONCURRENCY=1 should preserve meta information in includes', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/include-with-meta');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '-j 2',
            env: {
                PAGE_PROCESS_CONCURRENCY: '1',
            },
        });

        await compareDirectories(outputPath);
    });
});
