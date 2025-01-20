import {AsyncSeriesWaterfallHook, HookMap} from 'tapable';
import {IProvider, TranslateConfig} from '~/commands/translate/index';
import {intercept} from '~/core/utils';

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

export const Hooks = Symbol(`${name}Hooks`);

export function getHooks(program: {[Hooks]?: ReturnType<typeof hooks>}) {
    return program[Hooks] || hooks();
}
