import type {IProgram} from '~/program';
import yargs from 'yargs';
import {hideBin} from 'yargs/helpers';
import {Help} from 'commander';
import log from '@diplodoc/transform/lib/log';

import {BaseProgram} from '~/program/base';
import {Command} from '~/config';
import {build} from '~/cmd';

const command = 'Build';

export type BuildArgs = {};

export type BuildConfig = {};

const parser = yargs
    .command(build)
    .option('config', {
        alias: 'c',
        describe: 'YFM configuration file',
        type: 'string',
    })
    .option('strict', {
        alias: 's',
        default: false,
        describe: 'Run in strict mode',
        type: 'boolean',
    })
    .option('quiet', {
        alias: 'q',
        default: false,
        describe: "Run in quiet mode. Don't write logs to stdout",
        type: 'boolean',
    })
    .group(['config', 'strict', 'quiet', 'help', 'version'], 'Common options:')
    .version(typeof VERSION !== 'undefined' ? VERSION : '')
    .help();

export class Build
    // eslint-disable-next-line new-cap
    extends BaseProgram<BuildConfig, BuildArgs>(command, {
        config: {
            // scope: 'build',
            defaults: () => ({}),
        },
        command: {
            isDefault: true,
        },
        hooks: () => {},
    })
    implements IProgram<BuildArgs>
{
    readonly command = new Command('build')
        .allowUnknownOption(true)
        .description('Build documentation in target directory');

    protected options = [];

    apply(program?: IProgram) {
        super.apply(program);

        this.command.createHelp = function () {
            const help = new Help();
            help.formatHelp = () => parser.getHelp();
            return help;
        };
    }

    async action() {
        await parser.parse(hideBin(process.argv), {}, (err, {strict}, output) => {
            if (err) {
                console.error(err);
                process.exit(1);
            }

            const {warn, error} = log.get();

            if ((strict && warn.length) || error.length) {
                process.exit(1);
            }

            console.log(output);

            process.exit(0);
        });
    }
}
