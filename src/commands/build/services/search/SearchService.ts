import type {EntryInfo, OutputFormat, Run} from '~/commands/build';
import type {SearchProvider} from './types';

import {basename, join} from 'node:path';
import dedent from 'ts-dedent';

import {bounded, normalizePath} from '~/core/utils';
import {Template} from '~/core/template';
import {BUNDLE_FOLDER} from '~/constants';

import {getHooks, withHooks} from './hooks';
import {DefaultSearchProvider} from './provider';

const SEARCH_PAGE_DEPTH = 2;

const rebase = (url: string) => join('../'.repeat(SEARCH_PAGE_DEPTH), BUNDLE_FOLDER, url);

export type SearchServiceConfig = {
    outputFormat: `${OutputFormat}`;
    search: {
        enabled: boolean;
        provider: string;
    } & Hash<unknown>;
};

@withHooks
export class SearchService implements SearchProvider<RelativePath> {
    readonly name = 'Search';

    readonly run: Run;

    readonly logger: Run['logger'];

    private provider: SearchProvider;

    get enabled() {
        return this.run.config.outputFormat === 'html' && this.run.config.search.enabled !== false;
    }

    get connected() {
        const isDefault = this.provider instanceof DefaultSearchProvider;

        return this.enabled && !isDefault;
    }

    constructor(run: Run) {
        this.run = run;
        this.logger = run.logger;
        this.provider = new DefaultSearchProvider();
    }

    async init() {
        const enabled = this.run.config.search.enabled;
        const type = this.run.config.search.provider;
        if (!type || !enabled) {
            return;
        }

        const hook = getHooks(this).Provider.get(type);

        if (!hook) {
            this.logger.warn(`Search provider for '${type}' is not registered.`);
            return;
        }

        this.provider = await getHooks(this)
            .Provider.for(type)
            .promise(this.provider, this.run.config.search);
    }

    @bounded config(lang: string) {
        if (!this.enabled) {
            return undefined;
        }

        return {
            enabled: this.enabled,
            ...this.provider.config(lang),
        };
    }

    @bounded async add(path: RelativePath, lang: string, info: EntryInfo) {
        if (!this.enabled) {
            return;
        }

        const file = normalizePath(path);

        await this.provider.add(file, lang, info);
    }

    @bounded async release() {
        if (!this.enabled) {
            return;
        }

        await this.provider.release();
    }

    @bounded async page(lang: string) {
        const template = new Template('_search' as NormalizedPath, lang);
        const config = this.run.config;
        const baseInterface = config.interface;
        const faviconSrc = baseInterface ? baseInterface['favicon-src'] : '';

        const state = {
            lang,
            ...this.config(lang),
        };

        const title = lang === 'ru' ? 'Поиск' : 'Search';

        template.setTitle(title);
        template.setFaviconSrc(faviconSrc);
        template.addMeta({robots: 'noindex'});

        this.run.manifest.search.css
            .filter((file: string) => template.isRTL === file.includes('.rtl.css'))
            .map(rebase)
            .map(template.addStyle);

        this.run.manifest.search.js.map(rebase).map(template.addScript);

        const provider = this.run.config.search.provider;

        // Algolia automatically sets the window.__DATA__
        if (provider !== 'algolia') {
            template.addScript(template.escape(JSON.stringify(state)), {
                inline: true,
                position: 'state',
                attrs: {
                    type: 'application/json',
                    id: 'diplodoc-state',
                },
            });
            template.addScript(
                dedent`
                    const data = document.querySelector('script#diplodoc-state');
                    window.__DATA__ = {
                        search: JSON.parse((function ${template.unescape.toString()})(data.innerText)),
                    }
                `,
                {
                    inline: true,
                    position: 'state',
                },
            );
        }

        const resourcesLink = this.provider.resourcesLink?.(lang);

        if (resourcesLink) {
            const resourcesLinkBase = basename(resourcesLink);

            template.addScript(resourcesLinkBase);
        }

        await getHooks(this).Page.promise(template);

        return template.dump();
    }
}
