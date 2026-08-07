import {existsSync, mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

import {copyAssets} from './fs';

function makeProject() {
    const root = mkdtempSync(join(tmpdir(), 'yfm-copy-assets-'));
    const input = join(root, 'docs');
    const output = join(root, 'out');

    mkdirSync(join(input, 'ru', '_images'), {recursive: true});
    writeFileSync(join(input, 'ru', 'index.md'), '# Дока');
    writeFileSync(join(input, 'ru', 'toc.yaml'), 'title: Дока');
    writeFileSync(join(input, 'ru', '_images', 'camera.svg'), '<svg/>');
    writeFileSync(join(input, 'ru', 'logo.png'), 'png');

    return {input, output};
}

describe('translate copyAssets', () => {
    it('should copy non-translatable files into the target language directory', () => {
        const {input, output} = makeProject();

        const copied = copyAssets({
            input,
            output,
            source: {language: 'ru'},
            target: [{language: 'en'}],
        });

        expect(copied).toBe(2);
        expect(existsSync(join(output, 'en', '_images', 'camera.svg'))).toBe(true);
        expect(existsSync(join(output, 'en', 'logo.png'))).toBe(true);
        // Translatable files are produced by the translation itself.
        expect(existsSync(join(output, 'en', 'index.md'))).toBe(false);
        expect(existsSync(join(output, 'en', 'toc.yaml'))).toBe(false);
    });

    it('should copy assets for every target language', () => {
        const {input, output} = makeProject();

        copyAssets({
            input,
            output,
            source: {language: 'ru'},
            target: [{language: 'en'}, {language: 'de'}],
        });

        expect(existsSync(join(output, 'en', 'logo.png'))).toBe(true);
        expect(existsSync(join(output, 'de', 'logo.png'))).toBe(true);
    });

    it('should do nothing when the source language directory is absent', () => {
        const {input, output} = makeProject();

        const copied = copyAssets({
            input,
            output,
            source: {language: 'fr'},
            target: [{language: 'en'}],
        });

        expect(copied).toBe(0);
    });
});
