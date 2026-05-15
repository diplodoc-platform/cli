import type {IProvider, TranslateConfig} from '~/commands/translate/index';

import {AsyncSeriesWaterfallHook, HookMap} from 'tapable';

import {generateHooksAccess} from '~/core/utils';

export function hooks(name: string) {
    return {
        Provider: new HookMap(
            (provider: string) =>
                new AsyncSeriesWaterfallHook<[IProvider | undefined, TranslateConfig]>(
                    ['provider', 'config'],
                    `${name}.Provider.${provider}`,
                ),
        ),
    };
}

const [getHooks, withHooks] = generateHooksAccess('Translate', hooks);

export {getHooks, withHooks};
