import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import {join} from 'node:path';

import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

describe('Assets', () => {
    it('Assets', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/assets');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '-j2',
        });
        await compareDirectories(outputPath);
    });

    it('Assets HTML', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/assets');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: false,
            md2html: true,
            args: '-j2',
        });

        expect(fs.existsSync(join(outputPath, '_images/mountain.jpg'))).toBe(true);
        expect(fs.existsSync(join(outputPath, '_images/versions.png'))).toBe(true);
    });
});
