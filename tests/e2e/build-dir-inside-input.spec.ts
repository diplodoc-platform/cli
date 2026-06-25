import {access} from 'node:fs/promises';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';

import {TestAdapter, cleanupDirectory, getTestPaths} from '../fixtures';

const {inputPath} = getTestPaths('mocks/build-dir-inside-input');
const outputPath = join(inputPath, 'output');

afterEach(async () => {
    await cleanupDirectory(outputPath);
});

async function exists(path: string) {
    return access(path).then(
        () => true,
        () => false,
    );
}

describe('output inside input', () => {
    it('does not nest output on repeated html builds', async () => {
        for (let i = 0; i < 3; i++) {
            const report = await TestAdapter.build.run(inputPath, outputPath, ['-f', 'html']);
            expect(report.code).toBe(0);
        }

        expect(await exists(join(outputPath, 'output'))).toBe(false);
    });

    it('does not nest output on repeated md builds', async () => {
        for (let i = 0; i < 3; i++) {
            const report = await TestAdapter.build.run(inputPath, outputPath, ['-f', 'md']);
            expect(report.code).toBe(0);
        }

        expect(await exists(join(outputPath, 'output'))).toBe(false);
    });
});
