import type {EntryInfo, Run, SearchProvider} from '~/commands/build';
import type {Template} from '~/core/template';

import {join} from 'node:path';

import {shortLink} from '~/core/utils';

export class ExternalSearchProvider implements SearchProvider {
    private langs = new Set<string>();

    private tags = new Map<string, Set<string>>();

    private run: Run;

    constructor(run: Run) {
        this.run = run;
    }

    async add(_path: NormalizedPath, lang: string, info: EntryInfo) {
        this.langs.add(lang);
        if (info.meta?.noIndex || !Array.isArray(info.meta?.tags)) {
            return;
        }
        const tags = this.tags.get(lang) || new Set<string>();
        for (const tag of info.meta.tags) {
            if (typeof tag === 'string' && tag && !tag.startsWith('_')) {
                tags.add(tag);
            }
        }
        this.tags.set(lang, tags);
    }

    config(lang: string) {
        const {search, skipHtmlExtension} = this.run.config;
        const link = join('_search', lang, 'index.html');
        const tags = this.tags.get(lang);
        return {
            enabled: true,
            provider: 'external',
            api: '_search/external-api.js',
            endpoint: search.endpoint as string,
            options: search.options,
            ...(tags ? {tags: [...tags]} : {}),
            link: skipHtmlExtension ? shortLink(link) : link,
        };
    }

    configurePage = (template: Template) => {
        template.addCsp({'worker-src': ["'self'"]});
    };

    async release() {
        await this.run.copy(
            join(this.run.assetsPath, 'external-search/api.js'),
            join(this.run.output, '_search/external-api.js'),
        );
        for (const lang of this.langs) {
            await this.run.write(
                join(this.run.output, '_search', lang, 'index.html'),
                await this.run.search.page(lang),
                true,
            );
        }
    }
}
