import type {PrepareConfig, PrepareReport} from './types';
import type {BaseProgram} from '~/core/program';

import {join} from 'node:path';
import {writeFile} from 'node:fs/promises';

import {Command, args} from '~/core/config';
import {Build, Run} from '~/commands/build';
import {getHooks} from '~/core/program';

import {dryRun} from './config';
import {prepare} from './services/collector';

export type {PrepareArgs, PrepareConfig, PrepareResult} from './types';

/** Instantiate after command modules have loaded, avoiding the Build/threads/Program cycle. */
export function createPrepare() {
    class Prepare extends Build {
        readonly name = 'Build';

        declare readonly config: PrepareConfig;

        readonly command = new Command('prepare')
            .description('Collect the original source files used by the selected normal build')
            .helpOption(true)
            .allowUnknownOption(false);

        readonly options = [...new Build().options, dryRun];

        private collection?: {sources: Run['sources']; config?: string};

        apply(program?: BaseProgram) {
            getHooks<Run>(this).BeforeAnyRun.tapPromise('PrepareSources', async (run) => {
                const config = run.exists(run.configPath) ? run.configPath : undefined;
                if (config) {
                    await run.depend(config as AbsolutePath);
                }
                for (const dependency of this.dependencies) {
                    await run.depend(dependency);
                }
                this.collection = {sources: run.sources, config};
            });
            super.apply(program);
        }

        async action() {
            const report = process.env.YFM_PREPARE_REPORT;
            if (report) {
                await super.action();
                if (!this.collection) {
                    throw new Error('Prepare source collection was not initialized');
                }
                const result: PrepareReport = {
                    files: this.collection.sources.dependencies,
                    config: this.collection.config,
                };
                await writeFile(report, JSON.stringify(result));
                return;
            }
            const argv = args(this.command);
            let commandIndex = 2;
            const globals = this.command.parent?.options || [];
            for (; commandIndex < argv.length; commandIndex++) {
                const token = argv[commandIndex];
                if (token === this.command.name()) {
                    break;
                }
                const option = globals.find(
                    (candidate) => candidate.long === token || candidate.short === token,
                );
                if (
                    option?.required ||
                    (option?.optional && !argv[commandIndex + 1]?.startsWith('-'))
                ) {
                    commandIndex++;
                }
            }
            const result = await prepare(this.config, argv, commandIndex);
            const quote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;
            this.logger.info(
                `${this.config.dryRun ? 'Validated' : 'Prepared'} ${result.files} source files: ${result.output}`,
            );
            this.logger.info(`Build input: ${JSON.stringify(join(result.output, result.input))}`);
            if (result.config) {
                this.logger.info(
                    `Build config: ${JSON.stringify(join(result.output, result.config))}`,
                );
            }
            const extensions = result.extensions
                .map(
                    (extension) =>
                        ` -e ${quote(extension.local ? join(result.output, extension.name) : extension.name)}`,
                )
                .join('');
            this.logger.info(
                `Rebuild: yfm build -i ${quote(join(result.output, result.input))}${result.config ? ` -c ${quote(join(result.output, result.config))}` : ''}${extensions} -o ./site`,
            );
            this.logger.info(
                'Reuse the same selected build options and environment. Command-line overrides are not baked into the artifact.',
            );
        }

        protected createRun(): Run {
            return new Run(this.config, {selective: true});
        }
    }
    return new Prepare();
}
