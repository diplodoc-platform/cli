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
    section?: string;
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

        const $ = load(info.html || '');
        const sections: {heading: string; content: string}[] = [];
        let currentSection = {heading: '', content: ''};

        // Process all elements to split into sections
        $('body').children().each((_, element) => {
            const $el = $(element);
            
            // If it's a heading, start a new section
            if ($el.is('h1, h2, h3, h4, h5, h6')) {
                // Save previous section if it has content
                if (currentSection.content.trim()) {
                    sections.push({...currentSection});
                }
                currentSection = {
                    heading: $el.text().trim(),
                    content: ''
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

        // If no sections were found, create a single record
        if (sections.length === 0) {
            const record: AlgoliaJsonRecord = {
                objectID: `${lang}-${path}`,
                title,
                content: html2text(info.html || ''),
                headings: this.extractHeadings(info.html || ''),
                keywords: meta.keywords || [],
                url: path,
                lang,
            };

            if (!this.records[lang]) {
                this.records[lang] = [];
            }
            this.records[lang].push(record);
            return;
        }

        // Create records for each section
        sections.forEach((section, index) => {
            const record: AlgoliaJsonRecord = {
                objectID: `${lang}-${path}-${index}`,
                title,
                content: section.content.trim(),
                headings: [section.heading],
                keywords: meta.keywords || [],
                url: path,
                lang,
                section: section.heading || undefined,
            };

            if (!this.records[lang]) {
                this.records[lang] = [];
            }
            this.records[lang].push(record);
        });
    }

    async release() {
        // Write JSON files for each language
        for (const [lang, records] of Object.entries(this.records)) {
            const outputPath = join(this.run.output, '_search', `${lang}-algolia.json`);
            await this.run.write(outputPath, JSON.stringify(records, null, 2));
        }
    }

    config(_lang: string) {
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
