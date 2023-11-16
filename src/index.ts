import chalk from 'chalk';
import type {Argv} from 'yargs';
import yargs from 'yargs';
import {resolve, dirname} from 'node:path';
import {readFile} from 'node:fs/promises';
import {SyncHook} from 'tapable';
import {options, Command} from './config';
import log from '@diplodoc/transform/lib/log';
import {load} from 'js-yaml';

import {MAIN_TIMER_ID, YFM_CONFIG_FILENAME} from './constants';

import {Build, Publish, translate, xliff} from './cmd';

const isRelative = (path: string) => Boolean(path.match(/^\.{1,2}\/.+$/));

class HandledError {}

type Module = {
    apply(program: Program): void;
};

type ExtensionInfo = string | {
    path: string;
    options?: Record<string, any>;
};

type DefaultConfig = {
    extensions: ExtensionInfo[];
};

const NAME = 'yfm';
const USAGE = `<command> [global-options] [options]

${NAME} build -i ./src -o ./dst

If no command passed, ${chalk.bold('build')} command will be called by default.`;

export class Program {
    readonly command = new Command(NAME);

    readonly hooks = {
        Command: new SyncHook<Command>(['command'], 'command'),
    };

    readonly build = new Build();

    readonly publish = new Publish();

    private configDir: string = './';

    private config: DefaultConfig = {
        extensions: [],
    };

    private modules: Module[] = [
        this.build,
        this.publish,
        // this.xliff,
        // this.translate,
    ];

    constructor(readonly args: string[]) {}

    async apply() {
        console.time(MAIN_TIMER_ID);

        await this.init();
        await this.modules.reduce(
            (promise, module) => promise.then(() => module.apply(this)),
            Promise.resolve()
        );

        const {error, result} = await this.action();

        if (error) {
            if (!(error instanceof HandledError)) {
                console.error(error);
            }
        } else {
            console.log(result);
        }

        console.timeEnd(MAIN_TIMER_ID);
        process.exit(error ? 1 : 0);
    }

    async init() {
        const parser = new Command();
        const props = parser
            .helpOption(false)
            .allowUnknownOption()
            .addOption(options.config(this, YFM_CONFIG_FILENAME))
            .addOption(options.extensions(this))
            .addOption(options.input(this, './'))
            .addOption(options.quiet)
            .parse(this.args)
            .opts();

        this.command
            .addOption(options.config(this, YFM_CONFIG_FILENAME))
            .addOption(options.extensions(this))
            .addOption(options.quiet)
            .addOption(options.strict)
            .version(typeof VERSION !== 'undefined' ? VERSION : '', '--version', 'Output the version number')
            .usage(USAGE);

        await this.resolveConfig(props);
        await this.resolveExtensions(props);

        // const build = new Command('build');
        // build.addOption(input);

        // this.command.addCommand(build, {isDefault: true});



        // yargs
        //     .command(xliff)
        //     .command(translate)
    }

    async action() {
        program.hooks.Command.call(this.command);

        await this.command.parseAsync(this.args);

        return {};
        // return new Promise((resolve) => {
        //     yargs.parse(this.args, {}, (error, {strict}, result) => {
        //         if (error) {
        //             resolve({error});
        //         } else {
        //             const {warn, error} = log.get();
        //
        //             if (error.length || strict && warn.length) {
        //                 resolve({error: new HandledError()});
        //             } else {
        //                 resolve({result});
        //             }
        //         }
        //     });
        // });
    }

    private async resolveConfig(props) {
        const isDefault = props.config === YFM_CONFIG_FILENAME;
        const configPath = isRelative(props.config)
            ? resolve(props.config)
            : resolve(props.input, props.config);

        this.configDir = dirname(configPath);

        try {
            const configData = await readFile(configPath, 'utf-8');

            Object.assign(this.config, load(configData));
        } catch (error: any) {
            if (error.code === 'ENOENT' && isDefault) {
                return;
            }

            throw error;
        }
    }

    private async resolveExtensions(props) {
        const build = async (path: string, options: Record<string, any>) => {
            const ExtensionModule = await import(path);
            const Extension = ExtensionModule.Extension || ExtensionModule.default;

            return new Extension(options);
        };

        for (const ext of props.extensions) {
            const path = isRelative(ext) ? resolve(ext) : ext;
            const options = {};

            this.modules.push(await build(path, options));
        }

        for (const ext of this.config.extensions) {
            const extPath = typeof ext === 'string' ? ext : ext.path;
            const path = isRelative(extPath) ? resolve(this.configDir, extPath) : extPath;
            const options = typeof ext === 'string' ? {} : ext.options || {};

            this.modules.push(await build(path, options));
        }
    }
}

const program = new Program(process.argv);

program.apply();
