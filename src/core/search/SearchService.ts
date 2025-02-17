import type {DocPageData} from '@diplodoc/client/ssr';
import type {BaseConfig} from '~/core/program';
import type {Run as BaseRun} from '~/core/run';
import type {SearchProvider} from './types';

import {join} from 'node:path';
import {dedent} from 'ts-dedent';
import manifest from '@diplodoc/client/manifest';

import {bounded, normalizePath} from '~/core/utils';

import {getHooks, withHooks} from './hooks';
import {DefaultSearchProvider} from './provider';
import {BUNDLE_FOLDER, RTL_LANGS} from '~/constants';

const SEARCH_PAGE_DEPTH = 2;

export type SearchServiceConfig = {
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
        return this.run.config.search.enabled !== false;
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
        const type = this.run.config.search.provider;
        if (!type) {
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

    @bounded async add(path: RelativePath, lang: string, info: DocPageData) {
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

        return dedent`
            <!DOCTYPE html>
            <html lang="${lang}" dir="${isRTL ? 'rtl' : 'ltr'}">
                <head>
                    <meta charset="utf-8" />
                    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                    <meta name="robots" content="noindex"/>
                    <title>Search</title>
                    <style type="text/css">
                        body {
                            height: 100vh;
                        }
                    </style>
                    ${manifest.search.css
                        .filter((file: string) => isRTL === file.includes('.rtl.css'))
                        .map((url: string) =>
                            join('../'.repeat(SEARCH_PAGE_DEPTH), BUNDLE_FOLDER, url),
                        )
                        .map(
                            (src: string) =>
                                `<link type="text/css" rel="stylesheet" href="${src}" />`,
                        )
                        .join('\n')}
                </head>
                <body class="g-root g-root_theme_light">
                    <div id="root"></div>
                    ${manifest.search.js
                        .map((url: string) =>
                            join('../'.repeat(SEARCH_PAGE_DEPTH), BUNDLE_FOLDER, url),
                        )
                        .map(
                            (src: string) =>
                                `<script type="application/javascript" src="${src}"></script>`,
                        )
                        .join('\n')}
                </body>
            </html>
        `;
    }
}
