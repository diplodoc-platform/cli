import type {GlossaryPair} from './types';

import {ok} from 'node:assert';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {load} from 'js-yaml';

/**
 * Lists markdown pages of the corpus: paths relative to the language
 * directory, e.g. `syntax/code.md`. Every source page must have a
 * reference translation - the eval cannot score a page without one.
 */
export function listCorpusPages(
    corpus: string,
    sourceLanguage: string,
    targetLanguage: string,
): string[] {
    const sourceRoot = join(corpus, sourceLanguage);
    ok(existsSync(sourceRoot), `Corpus source directory not found: ${sourceRoot}`);

    const pages: string[] = [];

    const walk = (dir: string, prefix: string) => {
        for (const entry of readdirSync(dir, {withFileTypes: true})) {
            const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
                walk(join(dir, entry.name), relative);
            } else if (entry.name.endsWith('.md')) {
                pages.push(relative);
            }
        }
    };

    walk(sourceRoot, '');
    pages.sort();

    const missing = pages.filter((page) => !existsSync(join(corpus, targetLanguage, page)));
    ok(
        !missing.length,
        `Corpus pages have no ${targetLanguage} reference translation: ${missing.join(', ')}`,
    );

    return pages;
}

/**
 * Loads glossary pairs from the same YAML file that is passed to
 * `yfm translate --glossary`.
 */
export function loadGlossaryPairs(file: string): GlossaryPair[] {
    if (!existsSync(file)) {
        return [];
    }

    const data = load(readFileSync(file, 'utf8')) as {glossaryPairs?: GlossaryPair[]};
    return data?.glossaryPairs || [];
}
