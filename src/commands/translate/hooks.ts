import {AsyncSeriesWaterfallHook, HookMap} from 'tapable';
import {IProvider, TranslateConfig} from '~/commands/translate/index';
import {generateHooksAccess, intercept} from '~/core/utils';

const name = 'Translate';

export function hooks() {
    return intercept(name, {
        Provider: new HookMap(
            (provider: string) =>
                new AsyncSeriesWaterfallHook<[IProvider | undefined, TranslateConfig]>(
                    ['provider', 'config'],
                    `${name}.Provider.${provider}`,
                ),
        ),
    });
}

const [getHooks, withHooks] = generateHooksAccess(name, hooks);

export {getHooks, withHooks};
