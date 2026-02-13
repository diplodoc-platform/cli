import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, test} from 'vitest';

import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

function findFile(dir: string, predicate: (name: string) => boolean): string | null {
    try {
        for (const name of readdirSync(dir, {withFileTypes: true})) {
            const full = join(dir, name.name);
            if (name.isDirectory()) {
                const found = findFile(full, predicate);
                if (found) return found;
            } else if (predicate(name.name)) {
                return full;
            }
        }
    } catch {
        return null;
    }
    return null;
}

const generateMapTestTemplate = (
    testTitle: string,
    testRootPath: string,
    {md2md = true, md2html = true},
) => {
    test(testTitle, async () => {
        const {inputPath, outputPath} = getTestPaths(testRootPath);
        await TestAdapter.testBuildPass(inputPath, outputPath, {md2md, md2html});
        await compareDirectories(outputPath);
    });
};

describe('Allow load custom resources', () => {
    generateMapTestTemplate('md2md with metadata', 'mocks/metadata/md2md-with-metadata', {
        md2html: false,
    });

    generateMapTestTemplate('md2html with metadata', 'mocks/metadata/md2html-with-metadata', {
        md2md: false,
    });

    test('include file with csp metadata does not leak frontmatter into rendered HTML (two-step build)', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/metadata/include-with-csp-meta');

        // Step 1: md2md — include files get CSP frontmatter from config resources
        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
        });

        // Verify that md2md wrote frontmatter to the include file
        const mdIncludePath = findFile(
            outputPath,
            (n) => n.includes('support') && n.endsWith('.md'),
        );
        expect(mdIncludePath).toBeTruthy();
        const mdContent = readFileSync(mdIncludePath!, 'utf8');
        expect(mdContent).toMatch(/^---/);
        expect(mdContent).toMatch(/csp:/);

        // Step 2: md2html on md2md output — include frontmatter must not leak into HTML
        await TestAdapter.testBuildPass(outputPath, outputPath + '-html', {
            md2md: false,
            md2html: true,
        });

        const htmlPath = findFile(outputPath + '-html', (n) => n === 'page.html');
        expect(htmlPath).toBeTruthy();
        const html = readFileSync(htmlPath!, 'utf8');

        expect(html).not.toMatch(/style-src:\s*unsafe-inline/);
        expect(html).not.toMatch(/connect-src:\s*uaas\.yandex\.ru/);
        expect(html).toMatch(/Support content only/);
    }, 45000);
});
