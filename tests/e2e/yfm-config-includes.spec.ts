import {mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {load} from 'js-yaml';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

import {TestAdapter} from '../fixtures';

describe('project config includes', () => {
    let root: string;
    let input: string;

    beforeAll(() => {
        root = realpathSync(mkdtempSync(join(tmpdir(), 'diplodoc-yfm-')));
        input = join(root, 'input');
        mkdirSync(join(input, '_shared'), {recursive: true});
        writeFileSync(join(input, 'toc.yaml'), 'items: [{name: Home, href: index.md}]');
        writeFileSync(join(input, 'index.md'), '# Home');
    });

    afterAll(() => rmSync(root, {recursive: true, force: true}));

    it('publishes the same expanded author config in .yfm and the manifest', async () => {
        writeFileSync(join(input, '.yfm'), 'search: !include _shared/search.yaml\n');
        writeFileSync(
            join(input, '_shared/search.yaml'),
            'cluster:\n  projects: !include "./project names.yaml"\nhiddenPolicy: !include enabled.yaml',
        );
        writeFileSync(join(input, '_shared/project names.yaml'), '[spyt, chyt]');
        writeFileSync(join(input, '_shared/enabled.yaml'), 'true');

        const output = join(root, 'expanded');
        await TestAdapter.testBuildPass(input, output, {md2html: false});
        const expected = {search: {cluster: {projects: ['spyt', 'chyt']}, hiddenPolicy: true}};
        expect(load(readFileSync(join(output, '.yfm'), 'utf8'))).toEqual(expected);
        expect(
            JSON.parse(readFileSync(join(output, 'yfm-build-manifest.json'), 'utf8')).yfmConfig,
        ).toEqual(expected);
    });

    it('preserves the original file when !include is only a comment or a string', async () => {
        const source = '# !include missing.yaml\nlabel: "!include literal"\n';
        writeFileSync(join(input, '.yfm'), source);

        const output = join(root, 'plain');
        await TestAdapter.testBuildPass(input, output, {md2html: false});
        expect(readFileSync(join(output, '.yfm'), 'utf8')).toBe(source);
    });
});
