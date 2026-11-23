import type {MarkdownItPluginCb} from '@diplodoc/transform/lib/typings';

import {execFile} from 'node:child_process';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {describe, expect, it} from 'vitest';
import {buildSync} from 'esbuild';
import MarkdownIt from 'markdown-it';
import anchors from '@diplodoc/transform/lib/plugins/anchors';
import blockAnchor from '@diplodoc/transform/lib/plugins/block-anchor';

import {collectAnchorIds} from './collect';

type AnchorsOptions = {
    extractTitle?: boolean;
    supportGithubAnchors?: boolean;
};

function collect(markdown: string, options: AnchorsOptions = {}) {
    const md = new MarkdownIt({html: true});

    md.use(blockAnchor);
    md.use(anchors as unknown as MarkdownItPluginCb<AnchorsOptions>, {
        path: 'index.md',
        log: {warn() {}, error() {}},
        transformLink: (v: string) => v,
        getPublicPath: () => '',
        extractTitle: false,
        ...options,
    });

    const html = md.render(markdown);
    const anchorIds = new Set<string>();
    collectAnchorIds(html, anchorIds);

    return anchorIds;
}

describe('collectAnchorIds', () => {
    it.each([
        {html: '<div id="double\'quote"></div>', ids: ["double'quote"]},
        {html: "<div id='single\"quote'></div>", ids: ['single"quote']},
        {html: '<div id="line\nbreak"></div>', ids: ['line\nbreak']},
        {html: "<div ID = 'mixed-case'></div>", ids: ['mixed-case']},
        {html: '<div hidden data-title=\'id="wrong" >\' id="right"></div>', ids: ['right']},
        {html: '<div id="first" id="second"></div>', ids: ['first']},
        {html: '<div id="" id="second"></div>', ids: []},
        {html: '<div id></div>', ids: []},
        {html: '<div class="no-id"></div>', ids: []},
    ])('handles HTML attributes in $html', ({html, ids}) => {
        const anchorIds = new Set<string>();

        collectAnchorIds(html, anchorIds);

        expect(anchorIds).toEqual(new Set(ids));
    });

    it.each(['script', 'style', 'textarea', 'title'])(
        'ignores markup inside %s and collects IDs after its closing tag',
        (tag) => {
            const anchorIds = new Set<string>();

            collectAnchorIds(
                `<${tag} id="raw-text"><div id="ignored"></div></${tag}><div id="after"></div>`,
                anchorIds,
            );

            expect(anchorIds).toEqual(new Set(['raw-text', 'after']));
        },
    );

    it.each([
        'a-long-ascii-anchor-identifier',
        'длинный-пользовательский-якорь',
        'astral-🚀-characters-🚀-anchor',
        'combining-e\u0301-and-é-anchor',
        'isolated-high-\ud800-surrogate-anchor',
        'isolated-low-\udc00-surrogate-anchor',
    ])('preserves every UTF-16 code unit in %j', (id) => {
        const anchorIds = new Set<string>();
        collectAnchorIds(`<div id="${id}"></div>`, anchorIds);
        expect([...anchorIds]).toEqual([id]);
    });

    it('collects a slugified heading anchor', () => {
        const anchorIds = collect('## Automatic heading');

        expect(anchorIds.has('automatic-heading')).toBe(true);
    });

    it('collects a custom {#id} heading anchor', () => {
        const anchorIds = collect('## Plutonium {#over-plutonium}');

        expect(anchorIds.has('over-plutonium')).toBe(true);
    });

    it('collects numbered ids for duplicate headings', () => {
        const anchorIds = collect(['## Duplicate heading', '', '## Duplicate heading'].join('\n'));

        expect(anchorIds.has('duplicate-heading')).toBe(true);
        expect(anchorIds.has('duplicate-heading1')).toBe(true);
    });

    it('collects a block {% anchor %} id', () => {
        const anchorIds = collect('{% anchor block-anchor %}');

        expect(anchorIds.has('block-anchor')).toBe(true);
    });

    it('collects GitHub-style anchors when enabled', () => {
        const anchorIds = collect('## Automatic heading', {supportGithubAnchors: true});

        expect(anchorIds.has('automatic-heading')).toBe(true);
    });

    it('transliterates automatic non-ASCII heading anchors', () => {
        const anchorIds = collect('## Раздел');

        // Automatic slugs are transliterated by the anchors plugin, so the id
        // is ASCII regardless of the heading language.
        expect(anchorIds.has('razdel')).toBe(true);
    });

    it('keeps custom non-ASCII {#id} anchors in their decoded form', () => {
        const anchorIds = collect('## Раздел {#раздел}');

        // Custom ids are stored as-authored (decoded). The link plugin also
        // decodes hashes before comparison, so a percent-encoded link to this
        // anchor must match.
        expect(anchorIds.has('раздел')).toBe(true);
    });

    it('collects IDs from raw block and inline HTML', () => {
        const anchorIds = collect(
            '<div id="raw-block" data-title="a > b"></div>\n\nText <span id=raw-inline>here</span>',
        );

        expect(anchorIds).toEqual(new Set(['raw-block', 'raw-inline']));
    });

    it('collects the complete unquoted HTML id containing a slash', () => {
        expect(collect('<div id=foo/bar></div>')).toEqual(new Set(['foo/bar']));
    });

    it('does not collect raw HTML IDs when HTML rendering is disabled', () => {
        const html = new MarkdownIt({html: false}).render('<div id="raw-anchor"></div>');
        const anchorIds = new Set<string>();

        collectAnchorIds(html, anchorIds);

        expect(anchorIds.size).toBe(0);
    });

    it('decodes HTML entities and ignores markup in comments, code, and raw text', () => {
        const anchorIds = collect(
            '<div data-description="id=wrong" id="raw&amp;anchor"></div>\n' +
                '<!-- <div id="commented"></div> -->\n\n' +
                '`<div id="code"></div>`\n\n' +
                '<script>const sample = `<div id="script-content"></div>`;</script>',
        );

        expect(anchorIds).toEqual(new Set(['raw&anchor']));
    });
});

it('does not retain rendered documents through cached anchor IDs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'anchor-retention-'));
    try {
        buildSync({
            entryPoints: [fileURLToPath(new URL('./collect.ts', import.meta.url))],
            outfile: join(directory, 'collect.cjs'),
            bundle: true,
            platform: 'node',
            format: 'cjs',
            logLevel: 'silent',
        });
        const script = `
            const {collectAnchorIds} = require('./collect.cjs');
            const {setImmediate} = require('node:timers/promises');
            function retainIds() {
                const ids = new Set();
                for (let index = 0; index < 60; index++) {
                    const id = 'anchor-long-enough-to-be-a-slice-' + index;
                    const html = JSON.parse(JSON.stringify(
                        '<!-- ignored --><div id="' + id + '">' + 'x'.repeat(1024 * 1024) + '</div>'
                    ));
                    collectAnchorIds(html, ids);
                }
                return ids;
            }
            (async () => {
                for (let index = 0; index < 3; index++) global.gc();
                const before = process.memoryUsage().heapUsed;
                const ids = retainIds();
                await setImmediate();
                for (let index = 0; index < 3; index++) global.gc();
                console.log(JSON.stringify({
                    count: ids.size,
                    retainedBytes: process.memoryUsage().heapUsed - before
                }));
                globalThis.retainedIds = ids;
            })();
        `;
        const runner = join(directory, 'run.cjs');
        await writeFile(runner, script);
        const {stdout} = await promisify(execFile)(
            process.execPath,
            ['--expose-gc', '--max-old-space-size=256', runner],
            {env: {...process.env, NODE_OPTIONS: ''}, timeout: 30000},
        );
        const result = JSON.parse(stdout) as {count: number; retainedBytes: number};
        expect(result.count).toBe(60);
        // Allow the final document retained by V8's regexp state, but not all 60 documents.
        expect(result.retainedBytes).toBeLessThan(8 * 1024 * 1024);
    } finally {
        await rm(directory, {recursive: true, force: true});
    }
});
