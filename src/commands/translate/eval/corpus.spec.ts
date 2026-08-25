import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

import {listCorpusPages, loadGlossaryPairs} from './corpus';

function makeCorpus(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), 'eval-corpus-spec-'));
    for (const [path, content] of Object.entries(files)) {
        const target = join(root, path);
        mkdirSync(join(target, '..'), {recursive: true});
        writeFileSync(target, content);
    }
    return root;
}

describe('translate eval corpus', () => {
    it('should list source pages that have references', () => {
        const corpus = makeCorpus({
            'ru/about.md': 'x',
            'ru/syntax/code.md': 'x',
            'en/about.md': 'x',
            'en/syntax/code.md': 'x',
        });

        expect(listCorpusPages(corpus, 'ru', 'en')).toEqual(['about.md', 'syntax/code.md']);
    });

    it('should fail on a page without a reference', () => {
        const corpus = makeCorpus({'ru/about.md': 'x'});

        expect(() => listCorpusPages(corpus, 'ru', 'en')).toThrow(/no en reference/);
    });

    it('should load glossary pairs and tolerate a missing file', () => {
        const corpus = makeCorpus({
            'glossary.yaml': 'glossaryPairs:\n  - sourceText: заметка\n    translatedText: note\n',
        });

        expect(loadGlossaryPairs(join(corpus, 'glossary.yaml'))).toEqual([
            {sourceText: 'заметка', translatedText: 'note'},
        ]);
        expect(loadGlossaryPairs(join(corpus, 'missing.yaml'))).toEqual([]);
    });
});
