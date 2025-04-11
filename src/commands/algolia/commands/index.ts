import type {BaseArgs, ICallable} from '~/core/program';
import {readFileSync} from 'fs';
import {basename, join} from 'path';
import {algoliasearch} from 'algoliasearch';
import {glob} from 'glob';

import {
    BaseProgram,
    getHooks as getBaseHooks,
    withConfigDefaults,
    withConfigScope,
} from '~/core/program';
import {Command} from '~/core/config';
import {options as globalOptions} from '~/commands/config';

interface AlgoliaConfig {
    appId: string;
    apiKey: string;
    indexName: string;
}

interface AlgoliaObject extends Record<string, unknown> {
    objectID: string;
    title: string;
    url: string;
    content: string;
    headings: string[];
}

export type IndexArgs = BaseArgs & {
    input: string;
};

export type IndexConfig = Pick<BaseArgs, 'input' | 'strict' | 'quiet'> & {
    algolia: AlgoliaConfig;
};

@withConfigScope('index', {strict: true})
@withConfigDefaults(() => ({
    algolia: {
        appId: process.env.ALGOLIA_APP_ID || '',
        apiKey: process.env.ALGOLIA_API_KEY || '',
        indexName: process.env.ALGOLIA_INDEX_NAME || '',
    },
}))
export class Index extends BaseProgram<IndexConfig, IndexArgs> {
    readonly name = 'index';

    readonly command = new Command(this.name)
        .description('Upload index objects to Algolia')
        .helpOption(false)
        .allowUnknownOption(true);

    readonly options = [globalOptions.input('./')];

    protected readonly modules: ICallable[] = [];

    apply(program?: BaseProgram) {
        super.apply(program);

        getBaseHooks(this).Config.tap('Index', (config, args) => {
            const {input, quiet, strict} = args;

            return Object.assign(config, {
                input,
                quiet,
                strict,
            });
        });
    }

    async action() {
        const {input: inputPath, algolia} = this.config;

        if (!inputPath) {
            throw new Error('Input path is required');
        }

        if (!algolia.appId) {
            throw new Error(
                'Algolia Application ID is required. Set ALGOLIA_APP_ID environment variable or configure it in the config file.',
            );
        }

        if (!algolia.apiKey) {
            throw new Error(
                'Algolia API Key is required. Set ALGOLIA_API_KEY environment variable or configure it in the config file.',
            );
        }

        if (!algolia.indexName) {
            throw new Error(
                'Algolia Index Name is required. Set ALGOLIA_INDEX_NAME environment variable or configure it in the config file.',
            );
        }

        try {
            const client = algoliasearch(algolia.appId, algolia.apiKey);

            const files = glob.sync(join(inputPath, '_search/*-algolia.json'));

            if (files.length === 0) {
                throw new Error(
                    `No Algolia index files found in ${join(inputPath, '_search')}. Expected files matching pattern *-algolia.json`,
                );
            }

            const languages = files.map((file: string) => basename(file, '-algolia.json'));

            for (const lang of languages) {
                const filePath = join(inputPath, '_search', `${lang}-algolia.json`);

                try {
                    const content = readFileSync(filePath, 'utf-8');
                    const data: AlgoliaObject[] = JSON.parse(content);

                    client.setSettings({
                        indexName: `${algolia.indexName}_${lang}`,
                        indexSettings: {distinct: true},
                    });

                    await client.saveObjects({
                        objects: data,
                        waitForTasks: true,
                        indexName: `${algolia.indexName}_${lang}`,
                    });

                    this.logger.info(
                        `Uploaded ${data.length} objects to Algolia index ${algolia.indexName}_${lang}`,
                    );
                } catch (error) {
                    throw new Error(
                        `Error uploading objects to Algolia index ${algolia.indexName}_${lang}: ${error}`,
                    );
                }
            }
        } catch (error) {
            throw new Error(`Error processing Algolia upload: ${error}`);
        }
    }
}
