import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {glob} from 'glob';
import {describe, expect, it} from 'vitest';

import {TestAdapter, getTestPaths} from '../fixtures';

const STUB_MARKER = 'This page exceeds the maximum allowed size and cannot be displayed.';

describe('OpenAPI max include size', () => {
    it('should replace oversized pages with stub when limit is exceeded', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/openapi-include-size-exceeds');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--max-openapi-include-size 1K',
        });

        const files = await glob('**/*.md', {cwd: outputPath, nodir: true});
        expect(files.length).toBeGreaterThan(0);

        const stubbed = [];
        const preserved = [];
        for (const file of files) {
            const content = readFileSync(resolve(outputPath, file), 'utf-8');
            if (content.includes(STUB_MARKER)) {
                stubbed.push(file);
            } else {
                preserved.push(file);
            }
        }

        // Endpoint pages and main index exceed 1K and should be stubbed
        expect(stubbed.length).toBeGreaterThan(0);
    });

    it('should preserve all content when pages are within limit', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/openapi-include-size-within');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--max-openapi-include-size 1K',
        });

        const files = await glob('**/*.md', {cwd: outputPath, nodir: true});
        expect(files.length).toBeGreaterThan(0);

        for (const file of files) {
            const content = readFileSync(resolve(outputPath, file), 'utf-8');
            expect(content).not.toContain(STUB_MARKER);
        }
    });
});
