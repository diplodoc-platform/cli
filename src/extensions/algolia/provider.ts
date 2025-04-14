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
import {load} from 'cheerio';

export type ProviderConfig = AlgoliaSearchConfig['search'] & {
    api: string;
};

export type IndexRecord = {
    objectID: string;
    title: string;
    content: string;
    headings: string[];
    keywords: string[];
    url: string;
    lang: string;
    section?: string;
};

class IndexLogger extends Logger {
    index = this.topic(LogLevel.INFO, 'INDEX');
}

// Original Algolia provider
export class AlgoliaSearchProvider implements SearchProvider {
    private run: BuildRun;
    private apiLink: string;
    private index: boolean;
    private uploadDuringBuild: boolean;
    private appId: string;
    private apiKey?: string;
    private searchKey: string;
    private indexPrefix: string;
    private indexSettings: Partial<IndexSettings>;
    private querySettings: Partial<SearchParamsObject>;
    private objects: Record<string, IndexRecord[]> = {};
    private client?: Algoliasearch;
    private logger = new IndexLogger();

    constructor(run: BuildRun, config: ProviderConfig) {
        this.run = run;
        this.index = config.index !== false;
        this.uploadDuringBuild = config.uploadDuringBuild !== false;
        this.appId = config.appId;
        this.indexPrefix = config.indexPrefix;
        this.apiKey = config.apiKey;
        this.searchKey = config.searchKey;
        this.indexSettings = config.indexSettings || {};
        this.querySettings = config.querySettings || {};
        this.apiLink = config.api;

        if (this.apiKey) {
            this.client = algoliasearch(this.appId, this.apiKey);
        }
        this.logger.pipe(run.logger);
    }

    async add(path: NormalizedPath, lang: string, info: EntryInfo) {
        if (!info.html) {
            return;
        }

        const {title = '', meta = {}} = info;

        // Skip pages marked as noIndex
        if (meta.noIndex) {
            return;
        }

        const $ = load(info.html);
        const sections: {heading: string; content: string}[] = [];
        let currentSection = {heading: '', content: ''};

        // Process all elements to split into sections
        $('body')
            .children()
            .each((_, element) => {
                const $el = $(element);

                // If it's a heading, start a new section
                if ($el.is('h1, h2, h3, h4, h5, h6')) {
                    // Save previous section if it has content
                    if (currentSection.content.trim()) {
                        sections.push({...currentSection});
                    }
                    currentSection = {
                        heading: $el.text().trim(),
                        content: '',
                    };
                } else {
                    // Add content to current section
                    currentSection.content += $el.text().trim() + ' ';
                }
            });

        // Add the last section if it has content
        if (currentSection.content.trim()) {
            sections.push({...currentSection});
        }

        this.objects[lang] = this.objects[lang] || [];

        // If no sections were found, create a single record
        if (sections.length === 0) {
            const record: IndexRecord = {
                objectID: path.replace(extname(path), ''),
                title: title || meta.title || '',
                content: html2text(info.html).slice(0, 5000),
                headings: this.extractHeadings(info.html),
                keywords: meta.keywords || [],
                url: path.replace(extname(path), '') + '.html',
                lang,
            };
            this.objects[lang].push(record);
            return;
        }

        // Create records for each section
        sections.forEach((section, index) => {
            const record: IndexRecord = {
                objectID: `${path.replace(extname(path), '')}-${index}`,
                title: title || meta.title || '',
                content: section.content.trim(),
                headings: [section.heading],
                keywords: meta.keywords || [],
                url: path.replace(extname(path), '') + '.html',
                lang,
                section: section.heading || undefined,
            };
            this.objects[lang].push(record);
        });
    }

    async release() {
        await this.run.copy(join(__dirname, 'algolia-api.js'), join(this.run.output, this.apiLink));

        for (const lang of Object.keys(this.objects)) {
            const page = await this.run.search.page(lang);
            await this.run.write(join(this.run.output, pageLink(lang)), page);

            // Write JSON file for each language
            const jsonPath = join(this.run.output, '_search', `${lang}-algolia.json`);
            await this.run.write(jsonPath, JSON.stringify(this.objects[lang], null, 2));

            if (!this.index || !this.uploadDuringBuild || !this.client) {
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

    getIndexedCount(): number {
        const firstLang = Object.keys(this.objects)[0];
        return firstLang ? this.objects[firstLang].length : 0;
    }

    private extractHeadings(html: string): string[] {
        const $ = load(html);
        const headings: string[] = [];

        // Select all h1-h6 elements and extract their text
        $('h1, h2, h3, h4, h5, h6').each((_, element) => {
            // Get text content using contents() to handle nested elements properly
            const textPieces = $(element)
                .contents()
                .map((_, el) => $(el).text())
                .get();

            // Use Set to ensure uniqueness
            const uniqueText = [...new Set(textPieces)].join('').trim();

            if (uniqueText) {
                headings.push(uniqueText);
            }
        });

        return headings;
    }
}

// Helper functions
function pageLink(lang: string) {
    return join('_search', lang, `index.html`);
}

function getBaseLang(lang: string) {
    if (['ru', 'be', 'kz', 'ua'].includes(lang)) {
        return 'ru';
    }

    return 'en';
}
