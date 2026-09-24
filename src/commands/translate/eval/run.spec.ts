import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

import {baseTranslateArgs, evaluatePages} from './run';

describe('baseTranslateArgs', () => {
    it('should keep the judge flags off when judging is disabled', () => {
        const args = baseTranslateArgs({
            cli: 'build/index.js',
            corpus: '/corpus',
            output: '/out',
            source: 'ru-RU',
            target: 'en-US',
            judge: false,
            judgeThreshold: 70,
        });

        expect(args).not.toContain('--judge');
    });
});

describe('evaluatePages', () => {
    it('should report similarity and untranslated lines as unavailable without a reference', () => {
        const root = mkdtempSync(join(tmpdir(), 'eval-noref-'));
        const corpus = join(root, 'corpus');
        const output = join(root, 'out');
        mkdirSync(join(corpus, 'ru'), {recursive: true});
        mkdirSync(join(output, 'en'), {recursive: true});
        writeFileSync(join(corpus, 'ru', 'about.md'), '# Заголовок\n');
        writeFileSync(join(output, 'en', 'about.md'), '# Heading\n');

        const [page] = evaluatePages({
            pages: ['about.md'],
            corpus,
            output,
            sourceLang: 'ru',
            targetLang: 'en',
            glossaryPairs: [],
        });

        expect(page.similarity).toBeNull();
        expect(page.untranslated).toBeNull();
        expect(page.markupViolations).toEqual([]);
    });

    it('should score a page against its reference when there is one', () => {
        const root = mkdtempSync(join(tmpdir(), 'eval-ref-'));
        const corpus = join(root, 'corpus');
        const output = join(root, 'out');
        mkdirSync(join(corpus, 'ru'), {recursive: true});
        mkdirSync(join(corpus, 'en'), {recursive: true});
        mkdirSync(join(output, 'en'), {recursive: true});
        writeFileSync(join(corpus, 'ru', 'about.md'), '# Заголовок\n');
        writeFileSync(join(corpus, 'en', 'about.md'), '# Heading\n');
        writeFileSync(join(output, 'en', 'about.md'), '# Heading\n');

        const [page] = evaluatePages({
            pages: ['about.md'],
            corpus,
            output,
            sourceLang: 'ru',
            targetLang: 'en',
            glossaryPairs: [],
        });

        expect(page.similarity).toBe(1);
        expect(page.untranslated).toEqual([]);
    });
});
