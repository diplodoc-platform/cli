import {AsyncSeriesWaterfallHook, HookMap} from 'tapable';
import {AlgoliaCommandConfig} from '~/commands/algolia/index';
import {generateHooksAccess} from '~/core/utils';

export function hooks(name: string) {
    return {
        Provider: new HookMap(
            (provider: string) =>
                new AsyncSeriesWaterfallHook<[unknown | undefined, AlgoliaCommandConfig]>(
                    ['provider', 'config'],
                    `${name}.Provider.${provider}`,
                ),
        ),
    };
}

const [getHooks, withHooks] = generateHooksAccess('Algolia', hooks);

export {getHooks, withHooks}; 