import type {Build, Run} from '~/commands/build';
import type {SearchDocument} from '~/core/search-index';

import {join} from 'node:path';

import {getHooks as getBaseHooks} from '~/core/program';
import {option} from '~/core/config';
import {langFromPath} from '~/core/utils';
import {stats} from '~/core/logger';
import {SEARCH_CORPUS_PATH} from '~/core/search-index';
import {getHooks as getBuildHooks} from '~/commands/build';

import {createDocument} from './documents';

export type SearchIndexArgs = {searchIndex?: boolean};

export class SearchIndex {
    apply(program: Build) {
        let enabled = false;
        const documents = new WeakMap<Run, Map<string, SearchDocument>>();
        getBaseHooks(program).Command.tap('SearchIndex', (command) => {
            command.addOption(
                option({
                    flags: '--search-index',
                    desc: 'Export a backend-neutral search corpus for the search-index command.',
                }),
            );
        });
        getBaseHooks(program).Config.tap({name: 'SearchIndex', stage: Infinity}, (config, args) => {
            enabled = args.searchIndex === true;
            if (enabled && config.outputFormat !== 'html')
                throw new Error('--search-index requires HTML output.');
            if (enabled && config.watch)
                throw new Error(
                    '--search-index does not support watch mode; run a snapshot build.',
                );
            return config;
        });
        getBuildHooks(program)
            .BeforeRun.for('html')
            .tapPromise('SearchIndex', async (run) => {
                const output = join(run.output, SEARCH_CORPUS_PATH);
                if (run.exists(output)) await run.remove(output);
                if (enabled) {
                    documents.set(run, new Map());
                }
            });
        getBuildHooks(program)
            .Entry.for('html')
            .tap('SearchIndex', (run, path, info) => {
                const corpus = documents.get(run);
                if (!corpus) return;
                const document = createDocument(
                    path,
                    langFromPath(path, run.config),
                    info,
                    run.config.skipHtmlExtension,
                );
                if (document) corpus.set(document.path, document);
            });
        getBuildHooks(program)
            .AfterRun.for('html')
            .tapPromise('SearchIndex', async (run) => {
                const corpus = documents.get(run);
                if (!corpus || stats(run.logger).error) return;
                await run.write(
                    join(run.output, SEARCH_CORPUS_PATH),
                    JSON.stringify({
                        schemaVersion: 1,
                        documents: [...corpus.values()].sort((left, right) => {
                            if (left.path === right.path) return 0;
                            return left.path < right.path ? -1 : 1;
                        }),
                    }),
                    true,
                );
            });
    }
}
