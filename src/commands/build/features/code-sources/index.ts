import type {Build, Run} from '~/commands/build';
import type {Command} from '~/core/config';
import type {SourceConfig} from './sources';

import {isMainThread} from 'node:worker_threads';
import {resolve} from 'node:path';

import {defined} from '~/core/config';
import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getMarkdownHooks} from '~/core/markdown';

import {DEFAULT_DOWNLOAD_DIR, options} from './config';
import {fetchSources, hydrateSources, resolveSources} from './sources';
import {collect} from './collect';

export type {SourceConfig};

export type CodeSourcesArgs = {
    sourcesDownloadDir: AbsolutePath;
};

export type CodeSourcesConfig = CodeSourcesArgs & {
    /**
     * Sources referenced by `{% include-code %}`, keyed by the name used in
     * documents.
     *
     * Declared in the config file under `code-sources`; there is no CLI flag,
     * because the value is a map. Config keys are read verbatim from YAML, so
     * the kebab-case key is normalized into this field here.
     */
    codeSources: Hash<SourceConfig>;
};

export const NAME = 'CodeSources';

export class CodeSources {
    apply(program: Build) {
        getBaseHooks(program).Command.tap(NAME, (command: Command) => {
            command.addOption(options.sourcesDownloadDir);
        });

        getBaseHooks(program).Config.tap(NAME, (config, args) => {
            config.codeSources =
                ((config as Hash)['code-sources'] as Hash<SourceConfig>) ||
                config.codeSources ||
                {};
            // Resolved here rather than in the option parser: commander applies a
            // parser only to values that were actually passed, so the default
            // would stay relative and produce a read scope that matches nothing
            // until the directory happens to exist.
            config.sourcesDownloadDir = resolve(
                defined('sourcesDownloadDir', args, config) || DEFAULT_DOWNLOAD_DIR,
            );

            return config;
        });

        getBaseHooks<Run>(program).BeforeAnyRun.tapPromise(NAME, async (run) => {
            const sources = resolveSources(run);

            // `BeforeAnyRun` fires on every thread, but only the main thread may
            // touch the network: it runs to completion before workers are
            // spawned, so they find a warm cache and just read the commit back.
            if (isMainThread) {
                await fetchSources(run, sources);
            } else {
                await hydrateSources(run, sources);
            }

            // Source roots live outside the project input, so they have to be
            // registered as read scopes instead of bypassing the sandbox check
            // in `Run.read`.
            for (const source of Object.values(sources)) {
                run.addScope(`<source:${source.name}>`, source.root);
            }

            // Registered even with no sources declared: a document using the
            // directive must get a clear "unknown source" error rather than leak
            // the raw directive into link resolution downstream.
            getMarkdownHooks(run.markdown).Collects.tap(NAME, (collects) =>
                collects.concat(collect(run, sources)),
            );
        });
    }
}
