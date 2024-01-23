import type {IProgram} from '~/program';
import type {TranslateArgs, TranslateConfig} from '~/cmd/translate';
import {ok} from 'assert';
import {Translate} from '~/cmd/translate';
import { defined, resolveConfig } from '~/config';
import {Provider} from './provider';
import {options} from './config';
import {getYandexOAuthToken} from './oauth';

const ExtensionName = 'YandexTranslation';

export type YandexTranslationArgs = TranslateArgs & {
    folderId: string;
    oauthToken: string;
    glossary: string;
};

export type YandexTranslationConfig = TranslateConfig & {
    folderId: string;
    oauthToken: string;
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
            providerOption.choices([...(providerOption.argChoices || []), 'yandex']);
        });

        hooks.Config.tap(ExtensionName, (config, args) => {
            config.provider = defined('provider', args, config) || 'yandex';

            return config;
        });

        hooks.Provider.for('yandex').tap(ExtensionName, (_provider, config) => {
            hooks.Command.tap(ExtensionName, (command) => {
                command
                    .addOption(options.oauthToken)
                    .addOption(options.folderId);
            });

            hooks.Config.tapPromise(ExtensionName, async (config, args) => {
                ok(!config.oauthToken, 'Do not store `oauthToken` in public config');

                config.folderId = defined('folderId', args, config);
                config.oauthToken = defined('oauthToken', args) || (await getYandexOAuthToken());

                if (config.glossary) {
                    const glossaryConfig = await resolveConfig(config.glossary, {defaults: {glossaryPairs: []}})
                    config.glossaryPairs = glossaryConfig.glossaryPairs || [];
                } else {
                    config.glossaryPairs = [];
                }

                ok(config.folderId, 'Required prop folderId is not specified');

                return config;
            });

            return new Provider(config);
        });
    }
}
