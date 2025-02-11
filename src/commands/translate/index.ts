import type {BaseArgs, ICallable} from '~/core/program';
import type {Locale} from './utils';

import {ok} from 'assert';
import {pick} from 'lodash';

import {
    BaseProgram,
    getHooks as getBaseHooks,
    withConfigDefaults,
    withConfigScope,
} from '~/core/program';
import {Command, args, defined} from '~/core/config';
import {YFM_CONFIG_FILENAME} from '~/constants';

import {getHooks, withHooks} from './hooks';
import {DESCRIPTION, NAME, options} from './config';
import {Extract} from './commands/extract';
import {Compose} from './commands/compose';
import {Extension as YandexTranslation} from './providers/yandex';
import {resolveFiles, resolveSource, resolveTargets, resolveVars} from './utils';

export {getHooks};

export interface IProvider {
    skip(files: [string, string][], config: TranslateConfig): Promise<void>;
    translate(files: string[], config: TranslateConfig): Promise<void>;
}

export type TranslateArgs = BaseArgs & {
    output: AbsolutePath;
    provider: string;
    source?: string;
    target?: string | string[];
    include?: string[];
    exclude?: string[];
    vars?: Hash;
};

export type TranslateConfig = Pick<BaseArgs, 'input' | 'strict' | 'quiet'> & {
    output: AbsolutePath;
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

@withHooks
@withConfigScope(NAME, {strict: true})
@withConfigDefaults(() => ({
    dryRun: false,
}))
export class Translate extends BaseProgram<TranslateConfig, TranslateArgs> {
    readonly name = 'Translate';

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

    protected readonly modules: ICallable[] = [this.extract, this.compose, new YandexTranslation()];

    apply(program?: BaseProgram) {
        super.apply(program);

        getBaseHooks(this).Config.tap('Translate', (config, args) => {
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
        this['provider'] = await getHooks(this)
            .Provider.for(this.config.provider)
            .promise(undefined, this.config);

        ok(
            this.provider,
            `Translation provider with name '${this.config.provider}' is not resolved`,
        );

        await getBaseHooks(this).Command.promise(this.command, this.options);

        this.command.helpOption(true).allowUnknownOption(false);

        await this.parse(args(this.command));
    }
}
