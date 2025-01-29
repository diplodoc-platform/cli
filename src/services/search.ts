import type {DocInnerProps, DocPageData} from '@diplodoc/client';
import type {Lang} from '../constants';

import {SEARCH_API, SEARCH_LANGS} from '../constants';

import {join} from 'node:path';
import {mkdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

import {Indexer} from '@diplodoc/search-extension/indexer';
import {langs} from '@diplodoc/search-extension/worker/langs';

import {ArgvService} from '.';
import {generateStaticSearch} from '../pages';
import {copyFileSync} from 'fs';

const TIME = Date.now();

let indexer: Indexer;

function init() {
    indexer = new Indexer();
}

function isSearchEnabled() {
    const {search} = ArgvService.getConfig();

    return Boolean(search.enabled);
}

function isLocalSearchEnabled() {
    const {search} = ArgvService.getConfig();

    return isSearchEnabled() && search.provider === 'local';
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

    // TODO: adopt for non html links
    const url = router.pathname + '.html';

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

        const indexHash = hash(index as string);
        const registryHash = hash(registry as string);
        const resourcesData = resources(lang, indexHash, registryHash);

        mkdirSync(dir, {recursive: true});
        writeFileSync(indexLink(lang, indexHash), index as string, 'utf8');
        writeFileSync(registryLink(lang, registryHash), registry as string, 'utf8');

        if (resourcesData) {
            writeFileSync(resourcesLink(lang), resourcesData, 'utf8');
        }

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

function indexLink(lang: string, hash: string) {
    return outputLink(lang, `${hash}-index.js`);
}

function registryLink(lang: string, hash: string) {
    return outputLink(lang, `${hash}-registry.js`);
}

function resourcesLink(lang: string) {
    return outputLink(lang, `${TIME}-resources.js`);
}

function languageLink(lang: string) {
    return outputLink(lang, 'language.js');
}

function config(lang: string) {
    const {output} = ArgvService.getConfig();

    if (!isLocalSearchEnabled()) {
        return '';
    }

    const short = (link: string) => link.replace(output, '').replace(/^\/?/, '');

    return {
        provider: 'local',
        api: short(apiLink()),
        link: short(pageLink(lang)),
        resources: short(resourcesLink(lang)),
    };
}

function resources(lang: string, indexHash: string, registryHash: string) {
    const {output} = ArgvService.getConfig();

    const short = (link: string) => link.replace(output, '').replace(/^\/?/, '');

    const resources = {
        index: short(indexLink(lang, indexHash)),
        registry: short(registryLink(lang, registryHash)),
        language: langs.includes(lang) ? short(languageLink(lang)) : undefined,
    };

    return `window.__DATA__.search.resources = ${JSON.stringify(resources)};`;
}

function hash(content: string) {
    const hash = createHash('sha256');

    hash.update(content);

    return hash.digest('hex').slice(0, 12);
}

export default {
    init,
    add,
    release,
    config,
};
