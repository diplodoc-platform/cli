import type {ExtensionInfo} from '~/core/program';

import {Command} from '~/core/config';
import {YFM_CONFIG_FILENAME} from '~/constants';
import {Build} from './build';
import {Publish} from './publish';
import {Translate} from './translate';
import {BaseProgram, withConfigDefaults} from '~/core/program';

import {NAME, USAGE, options} from './config';

export type {EntryInfo, SearchProvider, SearchServiceConfig} from './build';

export {parse} from './parser';
export {
    Build,
    Run as BuildRun,
    getHooks as getBuildHooks,
    getSearchHooks,
    getEntryHooks,
} from './build';
export {Publish, Run as PublishRun, getHooks as getPublishHooks} from './publish';
export {Translate, getHooks as getTranslateHooks} from './translate';

@withConfigDefaults(() => ({
    extensions: [] as ExtensionInfo[],
}))
export class Program extends BaseProgram {
    readonly name = 'Program';

    readonly command: Command = new Command(NAME)
        .helpOption(true)
        .allowUnknownOption(false)
        .version(
            typeof VERSION === 'undefined' ? '' : VERSION,
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
        options.jobs,
    ];

    protected readonly modules = [this.build, this.publish, this.translate];
}
