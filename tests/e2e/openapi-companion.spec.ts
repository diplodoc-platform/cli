import {existsSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';

import {TestAdapter, getTestPaths} from '../fixtures';

/**
 * These tests cover the CLI-side guarantees for the OpenAPI spec companion that are
 * implemented in `packages/cli` (the openapi build wrapper + build-manifest feature):
 *  - the standalone `*.openapi.json` file lands in the final output tree (md2md);
 *  - its name is derived from the source spec (`petstore.yaml` -> `petstore.openapi.json`);
 *  - it is recorded in the build manifest with the exact emitted path and the sibling
 *    `index` leading page;
 *  - emission does not depend on `--build-manifest`;
 *  - for static md2html builds the companion hint is baked into the leading page `<body>`
 *    as an HTML comment (the viewer does this at serve time for md2md, but md2html has no
 *    viewer), gated by the companion actually being emitted.
 *
 * The companion *content* (filtering, x-hidden stripping, render-mode switching) is produced
 * by `@diplodoc/openapi-extension` and is covered by that package's own unit tests.
 */
describe('OpenAPI spec companion (CLI build)', () => {
    const COMPANION_PATH = 'api/petstore.openapi.json';
    const LEADING_PAGE = 'api/index';

    it('emits the .openapi.json companion into the md output tree', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/openapi-companion');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
        });

        const companion = resolve(outputPath, COMPANION_PATH);
        expect(existsSync(companion)).toBe(true);

        // The companion sits next to the generated leading page.
        expect(existsSync(resolve(outputPath, 'api/index.md'))).toBe(true);

        const raw = readFileSync(companion, 'utf-8');

        // Valid JSON describing the spec.
        const json = JSON.parse(raw);
        expect(json.openapi).toBeTruthy();
        expect(json.paths).toBeTruthy();

        // Minified: no pretty-print whitespace.
        expect(raw).not.toContain('\n');
        expect(raw).toBe(JSON.stringify(json));
    });

    it('emits the companion even without --build-manifest', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/openapi-companion');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
        });

        expect(existsSync(resolve(outputPath, COMPANION_PATH))).toBe(true);
        // Manifest is opt-in, so it must be absent here.
        expect(existsSync(resolve(outputPath, 'yfm-build-manifest.json'))).toBe(false);
    });

    it('records the companion in the build manifest with the exact emitted path', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/openapi-companion');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--build-manifest',
        });

        const manifest = JSON.parse(
            readFileSync(resolve(outputPath, 'yfm-build-manifest.json'), 'utf-8'),
        );

        expect(Array.isArray(manifest.openapiCompanions)).toBe(true);

        const entry = manifest.openapiCompanions.find(
            (c: {companionPath: string}) => c.companionPath === COMPANION_PATH,
        );
        expect(entry).toBeDefined();
        expect(entry.leadingPage).toBe(LEADING_PAGE);

        // The path advertised by the manifest must resolve to a real file in the output.
        expect(existsSync(resolve(outputPath, entry.companionPath))).toBe(true);
    });

    const COMMENT =
        '<!-- json-схема со спецификацией доступна по ссылке: petstore.openapi.json -->';

    it('bakes the companion comment into the static html body (md2html + ai opt-in)', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/openapi-companion');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: false,
            md2html: true,
            // md2html emits the companion only when AI companions are explicitly enabled.
            args: '--ai-openapi-companions',
        });

        expect(existsSync(resolve(outputPath, COMPANION_PATH))).toBe(true);

        const html = readFileSync(resolve(outputPath, 'api/index.html'), 'utf-8');
        expect(html).toContain(COMMENT);

        // The comment must live inside <body>.
        const body = html.slice(html.indexOf('<body'), html.indexOf('</body>'));
        expect(body).toContain(COMMENT);
    });

    it('omits the companion and the comment for md2html without ai opt-in', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/openapi-companion');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: false,
            md2html: true,
        });

        expect(existsSync(resolve(outputPath, COMPANION_PATH))).toBe(false);

        const html = readFileSync(resolve(outputPath, 'api/index.html'), 'utf-8');
        expect(html).not.toContain('json-схема со спецификацией доступна по ссылке');
    });
});

/**
 * Covers the leading-page render-mode knobs introduced together with the companion:
 *  - `leadingPage.spec.renderMode: inline | link` (toc);
 *  - `--max-openapi-include-inline-size` auto-switching `inline -> link`;
 *  - `ai.openapiCompanions: false` disabling companion emission.
 *
 * Assertions look at the generated leading page (`api/index.md`) and the presence of the
 * companion file, which are the observable CLI-side outputs of these knobs.
 */
describe('OpenAPI leading page render modes & params (CLI build)', () => {
    const COMPANION_PATH = 'api/petstore.openapi.json';
    const INDEX_MD = 'api/index.md';
    // Inline mode embeds the spec inside a `{% cut %}` block; link mode points to the companion.
    const INLINE_MARKER = '{% cut "Open API" %}';
    const LINK_MARKER = '[Open API specification](petstore.openapi.json)';

    it('renderMode: inline (default) embeds the spec and still emits the companion', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/openapi-companion');

        await TestAdapter.testBuildPass(inputPath, outputPath, {md2md: true, md2html: false});

        const index = readFileSync(resolve(outputPath, INDEX_MD), 'utf-8');
        expect(index).toContain(INLINE_MARKER);
        expect(index).not.toContain(LINK_MARKER);

        expect(existsSync(resolve(outputPath, COMPANION_PATH))).toBe(true);
    });

    it('renderMode: link renders a link to the companion instead of inlining it', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/openapi-companion-link');

        await TestAdapter.testBuildPass(inputPath, outputPath, {md2md: true, md2html: false});

        const index = readFileSync(resolve(outputPath, INDEX_MD), 'utf-8');
        expect(index).toContain(LINK_MARKER);
        expect(index).not.toContain(INLINE_MARKER);

        expect(existsSync(resolve(outputPath, COMPANION_PATH))).toBe(true);
    });

    it('--max-openapi-include-inline-size auto-switches inline -> link for large specs', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/openapi-companion');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            // 1 byte: any real spec exceeds it, forcing the link form.
            args: '--max-openapi-include-inline-size 1',
        });

        const index = readFileSync(resolve(outputPath, INDEX_MD), 'utf-8');
        expect(index).toContain(LINK_MARKER);
        expect(index).not.toContain(INLINE_MARKER);

        expect(existsSync(resolve(outputPath, COMPANION_PATH))).toBe(true);
    });

    it('--max-openapi-include-inline-size 0 always renders the spec as a link', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/openapi-companion');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--max-openapi-include-inline-size 0',
        });

        const index = readFileSync(resolve(outputPath, INDEX_MD), 'utf-8');
        expect(index).toContain(LINK_MARKER);
        expect(index).not.toContain(INLINE_MARKER);

        expect(existsSync(resolve(outputPath, COMPANION_PATH))).toBe(true);
    });

    it('ai.openapiCompanions: false disables the companion file (md2md)', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/openapi-companion-disabled');

        await TestAdapter.testBuildPass(inputPath, outputPath, {md2md: true, md2html: false});

        expect(existsSync(resolve(outputPath, COMPANION_PATH))).toBe(false);

        // With no companion to link to, the leading page falls back to inlining the spec.
        const index = readFileSync(resolve(outputPath, INDEX_MD), 'utf-8');
        expect(index).toContain(INLINE_MARKER);
        expect(index).not.toContain(LINK_MARKER);
    });
});
