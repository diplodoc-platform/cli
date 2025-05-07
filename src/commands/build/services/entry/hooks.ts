import type {Template} from '~/core/template';
import {EntryData, EntryResult, PageState} from './types';

import {AsyncSeriesHook, AsyncSeriesWaterfallHook} from 'tapable';

import {generateHooksAccess} from '~/core/utils';

export function hooks(name: string) {
    return {
        State: new AsyncSeriesHook<[PageState]>(['state'], `${name}.State`),
        Page: new AsyncSeriesHook<[Template]>(['template'], `${name}.Page`),
        Dump: new AsyncSeriesWaterfallHook<[EntryResult, EntryData]>(
            ['result', 'entry'],
            `${name}.Dump`,
        ),
    };
}

const [getHooks, withHooks] = generateHooksAccess('Entry', hooks);

export {getHooks, withHooks};
