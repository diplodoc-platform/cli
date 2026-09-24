import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';

import {TestAdapter, getTestPaths} from '../fixtures';

function readState(html: string) {
    const source = html.match(
        /<script type="application\/json" id="diplodoc-state">\s*([\s\S]*?)\s*<\/script>/,
    )?.[1];

    if (source === undefined) {
        throw new Error('Diplodoc state not found');
    }

    return JSON.parse(source.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
}

describe('Static content state', () => {
    it('uses the rendered main HTML instead of duplicating it in state', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/bundles');
        const staticOutputPath = `${outputPath}-static-content`;

        await TestAdapter.testBuildPass(inputPath, staticOutputPath, {
            md2md: false,
            md2html: true,
            args: '--static-content',
        });

        const html = readFileSync(resolve(staticOutputPath, 'index.html'), 'utf8');
        const state = readState(html);

        expect(html).toContain('data-html-id="main"');
        expect(state.data).not.toHaveProperty('html');
    });

    it('keeps HTML in state without static content', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/bundles');
        const dynamicOutputPath = `${outputPath}-dynamic-content`;

        await TestAdapter.testBuildPass(inputPath, dynamicOutputPath, {
            md2md: false,
            md2html: true,
        });

        const html = readFileSync(resolve(dynamicOutputPath, 'index.html'), 'utf8');
        const state = readState(html);

        expect(state.data).toHaveProperty('html');
    });

    it('keeps structured data for a static leading page', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/regression');
        const staticOutputPath = `${outputPath}-static-leading`;

        await TestAdapter.testBuildPass(inputPath, staticOutputPath, {
            md2md: false,
            md2html: true,
            args: '--static-content',
        });

        const html = readFileSync(resolve(staticOutputPath, 'index.html'), 'utf8');
        const state = readState(html);

        expect(state.data).toMatchObject({leading: true});
        expect(state.data).toHaveProperty('data');
    });
});
