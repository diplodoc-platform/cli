import type {ExtensionInfo, IProgram} from '~/core/program';

import {Command} from '~/core/config';
import {YFM_CONFIG_FILENAME} from '~/constants';
import {Build} from '~/commands/build';
import {Publish} from '~/commands/publish';
import {Translate} from '~/commands/translate';
import {BaseProgram, withDefaultConfig} from '~/core/program';

import {NAME, USAGE, options} from './config';

export {NAME};

export {parse} from './parser';

@withDefaultConfig({
    defaults: () => ({
        extensions: [] as ExtensionInfo[],
    }),
})
export class Program extends BaseProgram implements IProgram {
    readonly name = 'Program';

    readonly command: Command = new Command(NAME)
        .helpOption(true)
        .allowUnknownOption(false)
        .version(
            typeof VERSION !== 'undefined' ? VERSION : '',
            '--version',
            'Output the version number',
        )
        .usage(USAGE);

    readonly build = new Build(undefined, {isDefaultCommand: true});

    readonly publish = new Publish();

    readonly translate = new Translate();

    readonly options = [
        options.input('./'),
        options.config(YFM_CONFIG_FILENAME),
        options.extensions,
        options.quiet,
        options.strict,
    ];

    protected readonly modules = [this.build, this.publish, this.translate];
}
