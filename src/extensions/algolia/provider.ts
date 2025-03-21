import type {
    Algoliasearch,
    IndexSettings,
    SearchParamsObject,
    SupportedLanguage,
} from 'algoliasearch';
import type {BuildRun, EntryInfo, SearchProvider} from '@diplodoc/cli';
import type {AlgoliaSearchConfig} from './index';

import {extname, join} from 'node:path';
import {uniq} from 'lodash';
import {algoliasearch} from 'algoliasearch';
import {LogLevel, Logger} from '@diplodoc/cli/lib/logger';
import {html2text} from '@diplodoc/search-extension/indexer';

export type ProviderConfig = AlgoliaSearchConfig['search'] & {
    api: string;
};

export type IndexRecord = {
    objectID: string;
    title?: string;
    text: string;
    keywords: string[];
    url: string;
};

class IndexLogger extends Logger {
    index = this.topic(LogLevel.INFO, 'INDEX');
}

export class AlgoliaSearchProvider implements SearchProvider {
    private run: BuildRun;

    private apiLink: string;

    private index: boolean;

    private appId: string;

    private apiKey: string;

    private searchKey: string;

    private indexPrefix: string;

    private indexSettings: Partial<IndexSettings>;

    private querySettings: Partial<SearchParamsObject>;

    private objects: Hash<IndexRecord[]> = {};

    private client: Algoliasearch;

    private logger = new IndexLogger();

    constructor(run: BuildRun, config: ProviderConfig) {
        this.run = run;

        this.index = config.index !== false;
        this.appId = config.appId;
        this.indexPrefix = config.indexPrefix;
        this.apiKey = config.apiKey;
        this.searchKey = config.searchKey;
        this.indexSettings = config.indexSettings || {};
        this.querySettings = config.querySettings || {};
        this.apiLink = config.api;

        this.client = algoliasearch(this.appId, this.apiKey);

        this.logger.pipe(run.logger);
    }

    async add(path: NormalizedPath, lang: string, info: EntryInfo) {
        if (!info.html) {
            return;
        }

        this.objects[lang] = this.objects[lang] || [];
        this.objects[lang].push({
            objectID: path.replace(extname(path), ''),
            title: info.title || info.meta.title,
            text: html2text(info.html).slice(0, 5000),
            keywords: info.meta.keywords || [],
            url: path.replace(extname(path), '') + '.html',
        });
    }

    async release() {
        await this.run.copy(join(__dirname, 'algolia-api.js'), join(this.run.output, this.apiLink));

        for (const lang of Object.keys(this.objects)) {
            const page = await this.run.search.page(lang);
            await this.run.write(join(this.run.output, pageLink(lang)), page);

            if (!this.index) {
                continue;
            }

            const indexName = `${this.indexPrefix}-${lang}`;
            const baseLang = getBaseLang(lang);

            this.logger.index(
                `Name: ${indexName}, Lang: ${lang}, Records: ${this.objects[lang].length}`,
            );

            await this.client.setSettings({
                indexName,
                indexSettings: {
                    ...this.indexSettings,
                    indexLanguages: uniq([lang, baseLang]) as SupportedLanguage[],
                },
            });

            const tasks = await this.client.saveObjects({
                indexName,
                objects: this.objects[lang],
            });

            await Promise.all(
                tasks.map(async ({taskID}) => {
                    return this.client.waitForTask({
                        indexName,
                        taskID,
                    });
                }),
            );
        }
    }

    config(lang: string) {
        return {
            provider: 'algolia',
            api: this.apiLink,
            link: pageLink(lang),
            appId: this.appId,
            indexName: `${this.indexPrefix}-${lang}`,
            searchKey: this.searchKey,
            querySettings: this.querySettings,
        };
    }
}

function pageLink(lang: string) {
    return join('_search', lang, `index.html`);
}

function getBaseLang(lang: string) {
    if (['ru', 'be', 'kz', 'ua'].includes(lang)) {
        return 'ru';
    }

    return 'en';
}
