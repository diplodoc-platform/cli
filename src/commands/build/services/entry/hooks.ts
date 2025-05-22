import type {Template} from '~/core/template';
import type {VFile} from '~/core/utils';
import {EntryData, PageState} from './types';

import {AsyncSeriesHook} from 'tapable';

import {generateHooksAccess} from '~/core/utils';

export function hooks(name: string) {
    return {
        State: new AsyncSeriesHook<[PageState]>(['state'], `${name}.State`),
        Page: new AsyncSeriesHook<[Template]>(['template'], `${name}.Page`),
        Dump: new AsyncSeriesHook<[VFile<EntryData>]>(['vfile'], `${name}.Dump`),
    };
}

const [getHooks, withHooks] = generateHooksAccess('Entry', hooks);

export {getHooks, withHooks};
