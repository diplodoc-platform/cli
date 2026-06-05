import {describe, expect, test} from 'vitest';
import {join} from 'node:path';
import {access, readFile} from 'node:fs/promises';

import {TestAdapter, getTestPaths} from '../fixtures';

describe('Crawler manifest', () => {
    test('generates crawler-manifest.json', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/crawler-manifest/with-links');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--crawler-manifest',
        });

        const manifestContent = await readFile(join(outputPath, 'crawler-manifest.json'), 'utf-8');

        expect(JSON.parse(manifestContent)).toMatchSnapshot();
    });

    test('does not generate manifest when --crawler-manifest flag is absent', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/crawler-manifest/with-links');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
        });

        await expect(access(join(outputPath, 'crawler-manifest.json'))).rejects.toThrow();
    });

    test('does not generate manifest when there are no external links', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/crawler-manifest/no-links');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--crawler-manifest',
        });

        await expect(access(join(outputPath, 'crawler-manifest.json'))).rejects.toThrow();
    });

    test('reads crawlerManifest setting from .yfm config file', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/crawler-manifest/config');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
        });

        const manifestContent = await readFile(join(outputPath, 'crawler-manifest.json'), 'utf-8');
        const manifest = JSON.parse(manifestContent);

        expect(manifest.links['index.md']).toContain('https://config.example.com');
    });

    test('excludes urls by exact match and regexp from docs-viewer.crawler.exclude', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/crawler-manifest/exclude');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
        });

        const manifestContent = await readFile(join(outputPath, 'crawler-manifest.json'), 'utf-8');
        const manifest = JSON.parse(manifestContent);

        expect(manifest.links['index.md']).toContain('https://kept.example.com');
        expect(manifest.links['index.md']).not.toContain('https://excluded-exact.example.com');
        expect(manifest.links['index.md']).not.toContain(
            'https://excluded-regexp.example.com/some/path',
        );
    });

    test('includes notifications from root crawler config with defaults applied', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/crawler-manifest/notifications-root');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
        });

        const manifestContent = await readFile(join(outputPath, 'crawler-manifest.json'), 'utf-8');
        const manifest = JSON.parse(manifestContent);

        expect(manifest.notifications).toEqual({
            channels: ['email', 'messenger'],
            interval: 'daily',
            receivers: ['user1', 'user2'],
        });
    });

    test('includes notifications from docs-viewer.crawler config with default channel', async () => {
        const {inputPath, outputPath} = getTestPaths(
            'mocks/crawler-manifest/notifications-docs-viewer',
        );

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
        });

        const manifestContent = await readFile(join(outputPath, 'crawler-manifest.json'), 'utf-8');
        const manifest = JSON.parse(manifestContent);

        expect(manifest.notifications).toEqual({
            channels: ['email'],
            interval: 'weekly',
            receivers: ['user3'],
        });
    });

    test('omits notifications from manifest when receivers are not configured', async () => {
        const {inputPath, outputPath} = getTestPaths(
            'mocks/crawler-manifest/notifications-no-receivers',
        );

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
        });

        const manifestContent = await readFile(join(outputPath, 'crawler-manifest.json'), 'utf-8');
        const manifest = JSON.parse(manifestContent);

        expect(manifest.notifications).toBeUndefined();
    });
});
