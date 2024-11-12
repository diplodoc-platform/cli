import type {ICallable, IProgram, ProgramArgs, ProgramConfig} from '~/program';
import type {BaseHooks} from '~/program/base';
import type {Locale} from './utils';
import {ok} from 'assert';
import {pick} from 'lodash';
import {AsyncSeriesWaterfallHook, HookMap} from 'tapable';
import {BaseProgram} from '~/program/base';
import {Command, args, defined} from '~/config';
import {YFM_CONFIG_FILENAME} from '~/constants';
import {DESCRIPTION, NAME, options} from './config';

import {Extract} from './commands/extract';
import {Compose} from './commands/compose';
import {Extension as YandexTranslation} from './providers/yandex';

import {resolveFiles, resolveSource, resolveTargets, resolveVars} from './utils';

type Parent = IProgram & {
    translate: Translate;
};

const command = 'Translate';

const hooks = () => ({
    Provider: new HookMap(
        (provider: string) =>
            new AsyncSeriesWaterfallHook<[IProvider | undefined, TranslateConfig]>(
                ['provider', 'config'],
                `${command}.Provider.${provider}`,
            ),
    ),
});

export interface IProvider {
    skip(files: [string, string][], config: TranslateConfig): Promise<void>;
    translate(files: string[], config: TranslateConfig): Promise<void>;
}

export type TranslateArgs = ProgramArgs & {
    output: string;
    provider: string;
    source?: string;
    target?: string | string[];
    include?: string[];
    exclude?: string[];
    vars?: Hash;
};

export type TranslateConfig = Pick<ProgramConfig, 'input' | 'strict' | 'quiet'> & {
    output: string;
    provider: string;
    source: Locale;
    target: Locale[];
    include: string[];
    exclude: string[];
    files: string[];
    skipped: [string, string][];
    vars: Hash;
    dryRun: boolean;
};

export type TranslateHooks = ReturnType<typeof hooks>;

export class Translate
    // eslint-disable-next-line new-cap
    extends BaseProgram<TranslateConfig, TranslateArgs, TranslateHooks>('Translate', {
        config: {
            defaults: () => ({}),
            strictScope: NAME,
        },
        hooks: hooks(),
    })
    implements IProgram<TranslateArgs>
{
    static getHooks<
        Config extends TranslateConfig = TranslateConfig,
        Args extends TranslateArgs = TranslateArgs,
    >(program: Translate | IProgram | undefined): BaseHooks<Config, Args> & TranslateHooks {
        if (!program) {
            throw new Error('Unable to resolve Translate hooks. Program is undefined.');
        }

        if (program instanceof Translate) {
            return program.hooks as BaseHooks<Config, Args> & TranslateHooks;
        }

        if ((program as Parent).translate instanceof Translate) {
            return (program as Parent).translate.hooks as BaseHooks<Config, Args> & TranslateHooks;
        }

        throw new Error('Unable to resolve Translate hooks. Unexpected program instance.');
    }

    readonly command = new Command(NAME)
        .description(DESCRIPTION)
        .helpOption(false)
        .allowUnknownOption(true);

    readonly options = [
        options.input('./'),
        options.output(),
        options.provider,
        options.source,
        options.target,
        options.files,
        options.include,
        options.exclude,
        options.vars,
        options.dryRun,
        options.config(YFM_CONFIG_FILENAME),
    ];

    readonly provider: IProvider | undefined;

    readonly extract = new Extract();

    readonly compose = new Compose();

    private readonly modules: ICallable[] = [this.extract, this.compose];

    apply(program?: IProgram) {
        new YandexTranslation().apply(program || this);

        super.apply(program);

        for (const module of this.modules) {
            module.apply(this);
        }

        this.hooks.Config.tap('Translate', (config, args) => {
            const {input, output, quiet, strict} = pick(args, [
                'input',
                'output',
                'quiet',
                'strict',
            ]) as TranslateArgs;
            const source = resolveSource(config, args);
            const target = resolveTargets(config, args);
            const include = defined('include', args, config) || [];
            const exclude = defined('exclude', args, config) || [];
            const [files, skipped] = resolveFiles(
                input,
                defined('files', args, config),
                include,
                exclude,
                source.language,
                ['.md', '.yaml'],
            );
            const vars = resolveVars(config, args);

            return Object.assign(config, {
                input,
                output: output || input,
                quiet,
                strict,
                source,
                target,
                files,
                skipped,
                include,
                exclude,
                vars,
                provider: defined('provider', args, config),
                dryRun: defined('dryRun', args, config) || false,
            });
        });
    }

    async action() {
        if (this.provider) {
            await this.provider.skip(this.config.skipped, this.config);

            return this.provider.translate(this.config.files, this.config);
        }

        // @ts-ignore
        this['provider'] = await this.hooks.Provider.for(this.config.provider).promise(
            undefined,
            this.config,
        );

        ok(
            this.provider,
            `Translation provider with name '${this.config.provider}' is not resolved`,
        );

        await this.hooks.Command.promise(this.command, this.options);

        this.command.helpOption(true).allowUnknownOption(false);

        await this.parse(args(this.command));
    }
}
