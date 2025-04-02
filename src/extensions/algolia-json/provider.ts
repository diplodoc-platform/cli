import type {BuildRun, EntryInfo, SearchProvider} from '@diplodoc/cli';
import type {AlgoliaJsonSearchConfig} from './index';

import {join} from 'node:path';
import {html2text} from '@diplodoc/search-extension/indexer';
import {load} from 'cheerio';

export type ProviderConfig = AlgoliaJsonSearchConfig['search'] & {
    api: string;
};

export type AlgoliaJsonRecord = {
    objectID: string;
    title: string;
    content: string;
    headings: string[];
    keywords: string[];
    url: string;
    lang: string;
};

export class AlgoliaJsonSearchProvider implements SearchProvider {
    private run: BuildRun;
    private _config: ProviderConfig;
    private records: Record<string, AlgoliaJsonRecord[]> = {};

    constructor(run: BuildRun, config: ProviderConfig) {
        this.run = run;
        this._config = config;
    }

    async add(path: string, lang: string, info: EntryInfo) {
        const {title = '', meta = {}} = info;

        // Skip pages marked as noIndex
        if (meta.noIndex) {
            return;
        }

        // Extract headings from HTML content
        const headings = this.extractHeadings(info.html || '');
        
        // Convert HTML to plain text for search
        const content = html2text(info.html || '');

        const record: AlgoliaJsonRecord = {
            objectID: `${lang}-${path}`,
            title,
            content,
            headings,
            keywords: meta.keywords || [],
            url: path,
            lang,
        };

        if (!this.records[lang]) {
            this.records[lang] = [];
        }

        this.records[lang].push(record);
    }

    async release() {
        // Write JSON files for each language
        for (const [lang, records] of Object.entries(this.records)) {
            const outputPath = join(this.run.output, '_search', `${lang}-algolia.json`);
            await this.run.write(outputPath, JSON.stringify(records, null, 2));
        }
    }

    config(lang: string) {
        return {
            enabled: false,
            resources: '',
        };
    }

    private extractHeadings(html: string): string[] {
        const $ = load(html);
        const headings: string[] = [];
        
        // Select all h1-h6 elements and extract their text
        $('h1, h2, h3, h4, h5, h6').each((_, element) => {
            // Get text content using contents() to handle nested elements properly
            const textPieces = $(element).contents()
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