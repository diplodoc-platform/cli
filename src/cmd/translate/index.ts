import type {IProgram, ProgramArgs, ProgramConfig} from '~/program';
import type {BaseHooks} from '~/program/base';
import {ok} from 'assert';
import {pick} from 'lodash';
import {AsyncSeriesWaterfallHook, HookMap} from 'tapable';
import {BaseProgram} from '~/program/base';
import {Command, args} from '~/config';
import {YFM_CONFIG_FILENAME} from '~/constants';
import {DESCRIPTION, NAME, options} from './config';

import {Extension as YandexTranslation} from './providers/yandex';

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
    translate(config: TranslateConfig): Promise<void>;
}

export type TranslateArgs = ProgramArgs & {
    output: string;
    provider: string;
    sourceLanguage: string;
    targetLanguage: string;
};

export type TranslateConfig = Pick<ProgramConfig, 'input' | 'strict' | 'quiet'> & {
    output: string;
    provider: string;
    sourceLanguage: string;
    targetLanguage: string;
};

export type TranslateHooks = ReturnType<typeof hooks>;

export class Translate
    // eslint-disable-next-line new-cap
    extends BaseProgram<TranslateConfig, TranslateArgs, TranslateHooks>('Translate', {
        config: {
            defaults: () => ({}),
            strictScope: 'translate',
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
        options.output,
        options.provider,
        options.sourceLanguage,
        options.targetLanguage,
        options.config(YFM_CONFIG_FILENAME),
    ];

    readonly provider: IProvider | undefined;

    apply(program?: IProgram) {
        new YandexTranslation().apply(program || this);

        super.apply(program);

        this.hooks.Config.tap('Translate', (config, args) => {
            const options = this.options.map((option) => option.attributeName());

            Object.assign(config, pick(args, options));

            return config;
        });
    }

    async action() {
        if (!this.provider) {
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
        } else {
            await this.provider.translate(this.config);
        }
    }
}
