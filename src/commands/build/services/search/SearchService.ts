import type {BaseConfig} from '~/core/program';
import type {Run as BaseRun} from '~/core/run';
import type {EntryInfo, OutputFormat} from '../..';
import type {SearchProvider} from './types';

import {join} from 'node:path';
import manifest from '@diplodoc/client/manifest';

import {bounded, normalizePath} from '~/core/utils';
import {Template} from '~/core/template';

import {getHooks, withHooks} from './hooks';
import {DefaultSearchProvider} from './provider';
import {BUNDLE_FOLDER, RTL_LANGS} from '~/constants';

const SEARCH_PAGE_DEPTH = 2;

const rebase = (url: string) => join('../'.repeat(SEARCH_PAGE_DEPTH), BUNDLE_FOLDER, url);

export type SearchServiceConfig = {
    outputFormat: `${OutputFormat}`;
    search: {
        enabled: boolean;
        provider: string;
    } & Hash<unknown>;
};

type Run = BaseRun<BaseConfig & SearchServiceConfig>;

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
        const isRTL = RTL_LANGS.includes(lang);
        const template = new Template('_search' as NormalizedPath, lang);

        template.setTitle('Search');
        template.addMeta({robots: 'noindex'});

        manifest.search.css
            .filter((file: string) => isRTL === file.includes('.rtl.css'))
            .map(rebase)
            .map(template.addStyle);

        manifest.search.js.map(rebase).map(template.addScript);

        await getHooks(this).Page.promise(template);

        return template.dump();
    }
}
