import type {Translate, TranslateArgs, TranslateConfig} from '~/commands/translate';

import {ok} from 'assert';
import {join} from 'node:path';

import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks} from '~/commands/translate';
import {defined, resolveConfig} from '~/core/config';
import {own} from '~/utils';

import {Provider} from './provider';
import {options} from './config';
import {getYandexAuth} from './auth';

const ExtensionName = 'YandexTranslation';

type Args = {
    folder: string;
    auth: string;
    glossary: string;
};

type Config = {
    folder: string;
    auth: string;
    glossary: string;
    glossaryPairs: {
        sourceText: string;
        translatedText: string;
    }[];
};

export type YandexTranslationConfig = TranslateConfig & Config;

export class Extension {
    apply(program: Translate) {
        getBaseHooks(program).Command.tap(ExtensionName, (_command, options) => {
            const providerOption = options.find((option) => option.flags.match('--provider'));

            ok(providerOption, 'Unable to configure `--provider` option.');

            providerOption.defaultInfo = 'yandex';

            const choises = providerOption.argChoices || [];
            if (!choises.includes('yandex')) {
                choises.push('yandex');
            }

            providerOption.choices(choises);
        });

        getBaseHooks(program).Config.tap(ExtensionName, (config, args) => {
            config.provider = defined('provider', args, config) || 'yandex';

            return config;
        });

        getHooks(program)
            .Provider.for('yandex')
            .tap(ExtensionName, (_provider, config) => {
                getBaseHooks(program).Command.tap(ExtensionName, (command) => {
                    command
                        .addOption(options.auth)
                        .addOption(options.folder)
                        .addOption(options.glossary);
                });

                getBaseHooks<TranslateConfig & Partial<Config>, TranslateArgs & Partial<Args>>(
                    program,
                ).Config.tapPromise(ExtensionName, async (config, args) => {
                    ok(!config.auth, 'Do not store `authToken` in public config');
                    ok(args.auth, 'Required param auth is not configured');

                    config.auth = getYandexAuth(args.auth);
                    config.folder = defined('folder', args, config);

                    ok(config.auth, 'Required param auth is not configured');
                    ok(config.folder, 'Required param folder is not configured');

                    let glossary: AbsolutePath | undefined;
                    if (own<string, 'glossary'>(args, 'glossary')) {
                        glossary = join(args.input, args.glossary);
                    } else if (own<string, 'glossary'>(config, 'glossary')) {
                        glossary = config.resolve(config.glossary);
                    }

                    if (glossary) {
                        const glossaryConfig = await resolveConfig(glossary, {
                            defaults: {glossaryPairs: []},
                        });

                        config.glossaryPairs = glossaryConfig.glossaryPairs || [];
                    } else {
                        config.glossaryPairs = [];
                    }

                    return config;
                });

                const provider = new Provider(config);

                provider.pipe(program.logger);

                return provider;
            });
    }
}
