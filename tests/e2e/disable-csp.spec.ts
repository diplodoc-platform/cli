import {readFileSync, readdirSync} from 'node:fs';
import {join, sep} from 'node:path';
import {describe, expect, test} from 'vitest';

import {TestAdapter, getTestPaths} from '../fixtures';

function findHtmlFiles(dir: string): string[] {
    const results: string[] = [];

    try {
        for (const entry of readdirSync(dir, {withFileTypes: true})) {
            const full = join(dir, entry.name);

            if (entry.isDirectory()) {
                results.push(...findHtmlFiles(full));
            } else if (entry.name.endsWith('.html')) {
                results.push(full);
            }
        }
    } catch {
        // ignore
    }

    return results;
}

describe('disableCsp', () => {
    test('should not inject CSP meta tag when disableCsp is true with neuroExpert enabled', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/disable-csp');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: false,
            md2html: true,
            args: '-j2',
        });

        const htmlFiles = findHtmlFiles(outputPath);
        expect(htmlFiles.length).toBeGreaterThan(0);

        // No HTML page should contain CSP meta tag
        for (const htmlFile of htmlFiles) {
            const html = readFileSync(htmlFile, 'utf8');
            expect(html).not.toContain('Content-Security-Policy');
        }

        // Content pages (under en/) should still have the neuroExpert widget script
        const contentPages = htmlFiles.filter((f) => f.includes(`${sep}en${sep}`));
        expect(contentPages.length).toBeGreaterThan(0);

        for (const htmlFile of contentPages) {
            const html = readFileSync(htmlFile, 'utf8');
            expect(html).toContain('neuroexpert-widget');
        }
    });
});
