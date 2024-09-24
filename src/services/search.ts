import type {DocInnerProps, DocPageData} from '@diplodoc/client';
import type {Lang} from '../constants';

import {join} from 'node:path';
import {mkdirSync, writeFileSync} from 'node:fs';

import {Indexer} from '@diplodoc/search-extension/indexer';

import {ArgvService} from '.';
import {generateStaticSearch} from '../pages';
import {copyFileSync} from 'fs';

const api = require.resolve('@diplodoc/search-extension/worker');

let indexer: Indexer;

function init() {
    indexer = new Indexer();
}

function add(info: DocInnerProps) {
    const {search} = ArgvService.getConfig();
    if (!search || search.provider !== 'local') {
        return;
    }

    const {lang, data, router} = info;

    // TODO: index leading and lpc pages
    if (data.leading) {
        return;
    }

    const base = (data.toc as {base?: string}).base || '';
    const url = base + '/' + router.pathname;

    indexer.add(lang, url, data as DocPageData);
}

async function release() {
    const {search} = ArgvService.getConfig();
    if (!search) {
        return;
    }

    if (search.provider === 'local') {
        copyFileSync(api, apiLink());
    }

    for (const lang of indexer.langs) {
        const {index, registry} = await indexer.release(lang);
        const dir = outputDir(lang);

        mkdirSync(dir, {recursive: true});
        writeFileSync(indexLink(lang), index, 'utf8');
        writeFileSync(registryLink(lang), registry, 'utf8');
        writeFileSync(pageLink(lang), generateStaticSearch(lang as Lang), 'utf8');
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
    return outputLink(lang, 'index.json');
}

function registryLink(lang: string) {
    return outputLink(lang, 'registry.json');
}

function config(lang: string) {
    const {search, output} = ArgvService.getConfig();

    if (!search || search.provider !== 'local') {
        return {};
    }

    const short = (link: string, root: string) => link.replace(root, '').replace(/^\/?/, '');

    return {
        api: short(apiLink(), bundleDir()),
        link: short(pageLink(lang), output),
        resources: {
            index: short(indexLink(lang), output),
            registry: short(registryLink(lang), output),
        },
    };
}

export default {
    init,
    add,
    release,
    config,
};
