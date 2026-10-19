import type {PrepareConfig} from './types';

import {join} from 'node:path';

import {Command, args} from '~/core/config';
import {Build} from '~/commands/build';

import {dryRun} from './config';
import {prepare} from './services/collector';
import {assertPrepareWrites, withPrepareWrites} from './write-guard';

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

        async action() {
            assertPrepareWrites();
            const argv = args(this.command);
            let commandIndex = 2;
            const globals = this.command.parent?.options || [];
            for (; commandIndex < argv.length; commandIndex++) {
                const token = argv[commandIndex];
                if (token === this.command.name()) break;
                const option = globals.find(
                    (candidate) => candidate.long === token || candidate.short === token,
                );
                if (
                    option?.required ||
                    (option?.optional && !argv[commandIndex + 1]?.startsWith('-'))
                )
                    commandIndex++;
            }
            const result = await withPrepareWrites(() => prepare(this.config, argv, commandIndex));
            const quote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;
            this.logger.info(
                `${this.config.dryRun ? 'Validated' : 'Prepared'} ${result.files} source files: ${result.output}`,
            );
            this.logger.info(`Build input: ${JSON.stringify(join(result.output, result.input))}`);
            if (result.config)
                this.logger.info(
                    `Build config: ${JSON.stringify(join(result.output, result.config))}`,
                );
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
    }
    return new Prepare();
}
