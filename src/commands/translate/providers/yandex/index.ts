import type {IProgram} from '~/program';
import type {TranslateArgs, TranslateConfig} from '~/commands/translate';
import {ok} from 'assert';
import {resolve} from 'node:path';
import {Translate} from '~/commands/translate';
import {defined, resolveConfig} from '~/config';
import {Provider} from './provider';
import {options} from './config';
import {getYandexAuth} from './auth';

const ExtensionName = 'YandexTranslation';

export type YandexTranslationArgs = TranslateArgs & {
    folder: string;
    auth: string;
    glossary: string;
};

export type YandexTranslationConfig = TranslateConfig & {
    folder: string;
    auth: string;
    glossary: string;
    glossaryPairs: {
        sourceText: string;
        translatedText: string;
    }[];
};

export class Extension {
    apply(program: Translate | IProgram) {
        const hooks = Translate.getHooks<YandexTranslationConfig, YandexTranslationArgs>(program);

        hooks.Command.tap(ExtensionName, (_command, options) => {
            const providerOption = options.find((option) => option.flags.match('--provider'));

            ok(providerOption, 'Unable to configure `--provider` option.');

            providerOption.defaultInfo = 'yandex';

            const choises = providerOption.argChoices || [];
            if (!choises.includes('yandex')) {
                choises.push('yandex');
            }

            providerOption.choices(choises);
        });

        hooks.Config.tap(ExtensionName, (config, args) => {
            config.provider = defined('provider', args, config) || 'yandex';

            return config;
        });

        hooks.Provider.for('yandex').tap(ExtensionName, (_provider, config) => {
            hooks.Command.tap(ExtensionName, (command) => {
                command
                    .addOption(options.auth)
                    .addOption(options.folder)
                    .addOption(options.glossary);
            });

            hooks.Config.tapPromise(ExtensionName, async (config, args) => {
                ok(!config.auth, 'Do not store `authToken` in public config');
                ok(args.auth, 'Required param auth is not configured');

                config.auth = getYandexAuth(args.auth);
                config.folder = defined('folder', args, config);

                ok(config.auth, 'Required param auth is not configured');
                ok(config.folder, 'Required param folder is not configured');

                if (defined('glossary', args, config)) {
                    let glossary: AbsolutePath;
                    if (defined('glossary', args)) {
                        glossary = resolve(args.input, args.glossary);
                    } else {
                        glossary = config.resolve(config.glossary);
                    }

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

            provider.logger.pipe(program.logger);

            return provider;
        });
    }
}
