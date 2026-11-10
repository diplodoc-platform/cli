import type {BaseArgs, BaseConfig} from '~/core/program';
import type {SearchIndexOptions, SearchIndexer} from '~/core/search-index';

import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

import {BaseProgram} from '~/core/program';
import {Command, option} from '~/core/config';
import {options as globalOptions} from '~/commands/config';
import {SEARCH_CORPUS_PATH, validateCorpus} from '~/core/search-index';

import {opensearch} from './providers/opensearch';
import {loadIndexer} from './load';

type IndexArgs = BaseArgs & SearchIndexOptions & {provider: string};

/** Upload a previously built search corpus without rebuilding documentation. */
export class SearchIndex extends BaseProgram<BaseConfig, IndexArgs> {
    readonly name = 'SearchIndex';

    readonly command = new Command('search-index').description(
        'Upload an exported search corpus through OpenSearch or a custom indexer module.',
    );

    readonly options = [
        globalOptions.input('./'),
        option({
            flags: '--provider <module>',
            desc: 'opensearch or a JS module exporting index(corpus, options).',
            env: 'SEARCH_INDEX_PROVIDER',
            default: 'opensearch',
        }),
        option({
            flags: '--endpoint <url>',
            desc: 'Server-side indexing endpoint.',
            env: 'SEARCH_INDEX_ENDPOINT',
        }),
        option({
            flags: '--index-name <name>',
            desc: 'Target index alias.',
            env: 'SEARCH_INDEX_NAME',
            default: 'docs',
        }),
        option({
            flags: '--authorization <header>',
            desc: 'Private HTTP Authorization header for indexing.',
            env: 'SEARCH_INDEX_AUTHORIZATION',
        }),
        option({
            flags: '--options <json>',
            desc: 'Additional custom indexer options as a JSON object.',
            parser: JSON.parse,
        }),
    ];

    async action(args: IndexArgs) {
        const {input, provider, ...options} = args;
        const corpus: unknown = JSON.parse(await readFile(join(input, SEARCH_CORPUS_PATH), 'utf8'));
        validateCorpus(corpus);
        if (
            options.options !== undefined &&
            (!options.options ||
                typeof options.options !== 'object' ||
                Array.isArray(options.options))
        ) {
            throw new Error('--options must be a JSON object.');
        }
        let indexer: SearchIndexer;
        if (provider === 'opensearch') {
            indexer = opensearch;
        } else {
            indexer = await loadIndexer(provider);
        }
        await indexer.index(corpus, {
            indexName: options.indexName,
            endpoint: options.endpoint,
            authorization: options.authorization,
            options: options.options,
        });
        this.logger.info(`Indexed ${corpus.documents.length} documentation pages.`);
    }
}
