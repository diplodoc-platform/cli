import type {DocInnerProps, DocPageData} from '@diplodoc/client';
import type {Lang} from '../constants';

import {SEARCH_API, SEARCH_LANGS} from '../constants';

import {join} from 'node:path';
import {mkdirSync, writeFileSync} from 'node:fs';

import {Indexer} from '@diplodoc/search-extension/indexer';
import {langs} from '@diplodoc/search-extension/worker/langs';

import {ArgvService, TocService} from '.';
import {generateStaticSearch} from '../pages';
import {copyFileSync} from 'fs';

let indexer: Indexer;

function init() {
    indexer = new Indexer();
}

function isSearchEnabled() {
    const {search} = ArgvService.getConfig();

    return Boolean(search);
}

function isLocalSearchEnabled() {
    const {search} = ArgvService.getConfig();

    return (
        isSearchEnabled() && (search === true || search!.provider === 'local' || !search!.provider)
    );
}

function add(path: string, info: DocInnerProps) {
    if (!isLocalSearchEnabled()) {
        return;
    }

    const {lang, data, router} = info;

    // TODO: index leading and lpc pages
    if (data.leading) {
        return;
    }

    const toc = TocService.getForPath(path)[1];
    const base = (toc as {base?: string}).base || '';
    const url = base + '/' + router.pathname;

    indexer.add(lang, url, data as DocPageData);
}

async function release() {
    if (!isSearchEnabled()) {
        return;
    }

    if (isLocalSearchEnabled()) {
        mkdirSync(bundleDir(), {recursive: true});
        copyFileSync(SEARCH_API, apiLink());
    }

    for (const lang of indexer.langs) {
        const {index, registry} = await indexer.release(lang);
        const dir = outputDir(lang);

        mkdirSync(dir, {recursive: true});
        writeFileSync(indexLink(lang), index, 'utf8');
        writeFileSync(registryLink(lang), registry, 'utf8');
        writeFileSync(pageLink(lang), generateStaticSearch(lang as Lang), 'utf8');

        if (isLocalSearchEnabled() && langs.includes(lang)) {
            copyFileSync(join(SEARCH_LANGS, lang + '.js'), languageLink(lang));
        }
    }
}

function outputDir(lang: string) {
    const {output} = ArgvService.getConfig();
    return join(output, '_search', lang);
}

function bundleDir() {
    const {output} = ArgvService.getConfig();
    return join(output, '_bundle');
}

function outputLink(lang: string, file: string) {
    const dir = outputDir(lang);
    const path = join(dir, file);

    return path;
}

// <root>/_search/ru
export const SEARCH_PAGE_DEPTH = 2;

function pageLink(lang: string) {
    return outputLink(lang, 'index.html');
}

function apiLink() {
    const dir = bundleDir();
    const path = join(dir, 'search-api.js');

    return path;
}

function indexLink(lang: string) {
    return outputLink(lang, 'index.js');
}

function registryLink(lang: string) {
    return outputLink(lang, 'registry.js');
}

function languageLink(lang: string) {
    return outputLink(lang, 'language.js');
}

function config(lang: string) {
    const {output} = ArgvService.getConfig();

    if (!isLocalSearchEnabled()) {
        return {};
    }

    const short = (link: string) => link.replace(output, '').replace(/^\/?/, '');

    return {
        api: short(apiLink()),
        link: short(pageLink(lang)),
        resources: {
            index: short(indexLink(lang)),
            registry: short(registryLink(lang)),
            language: langs.includes(lang) ? short(languageLink(lang)) : undefined,
        },
    };
}

export default {
    init,
    add,
    release,
    config,
};
