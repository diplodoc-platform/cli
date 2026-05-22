import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {glob} from 'glob';
import {describe, expect, it} from 'vitest';
import assets from '@diplodoc/cli/manifest';

import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

const EXPECTED_EXTENSIONS = [
    'latex-extension.css',
    'latex-extension.js',
    'mermaid-extension.js',
    'page-constructor-extension.css',
    'page-constructor-extension.js',
];

describe('Check bundles', () => {
    it('bundles list is correct', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/bundles');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: false,
            md2html: true,
            args: '-j2',
        });

        const allFiles = await glob('**/*', {
            cwd: outputPath,
            dot: true,
            follow: true,
            nodir: true,
            posix: true,
        });

        const bundleFiles = allFiles.filter((f) => f.startsWith('_bundle/'));
        const bundleBasenames = new Set(bundleFiles.map((f) => f.slice('_bundle/'.length)));

        // Every manifest entry must be present in the output
        for (const entry of Object.values(assets)) {
            for (const files of Object.values(entry as Record<string, string[]>)) {
                for (const file of files) {
                    expect(bundleBasenames, `missing manifest entry: ${file}`).toContain(file);
                }
            }
        }

        // Extension bundles must be present
        for (const ext of EXPECTED_EXTENSIONS) {
            expect(bundleBasenames, `missing extension bundle: ${ext}`).toContain(ext);
        }

        // HTML pages should only reference bundles and search files that exist in output
        const outputFiles = new Set(allFiles);
        const htmlFiles = allFiles.filter((f) => f.endsWith('.html') && !f.startsWith('_search/'));
        for (const htmlFile of htmlFiles) {
            const content = readFileSync(resolve(outputPath, htmlFile), 'utf8');
            const refs = [...content.matchAll(/(?:src|href)="(_(?:bundle|search)\/[^"]+)"/g)].map(
                (m) => m[1],
            );
            for (const ref of refs) {
                expect(outputFiles, `${htmlFile} references missing file: ${ref}`).toContain(ref);
            }
        }

        // Search index must be generated (local search is configured in this mock)
        const searchFiles = allFiles.filter((f) => f.startsWith('_search/'));
        expect(searchFiles.some((f) => f.endsWith('/api.js'))).toBe(true);
        expect(searchFiles.some((f) => f.endsWith('/index.html'))).toBe(true);
        expect(searchFiles.some((f) => f.endsWith('/language.js'))).toBe(true);

        // Verify non-bundle content via standard snapshot comparison (strips system links)
        await compareDirectories(outputPath);
    });
});
