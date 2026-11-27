import {SyncHook} from 'tapable';

import {generateHooksAccess} from '~/core/utils';

export function hooks(name: string) {
    return {
        Info: new SyncHook<[string]>(['message'], `${name}.Info`),
        Deprecation: new SyncHook<[string]>(['message'], `${name}.Deprecation`),
        Warn: new SyncHook<[string]>(['message'], `${name}.Warn`),
        Error: new SyncHook<[string]>(['message'], `${name}.Error`),
    };
}

const [getHooks, withHooks] = generateHooksAccess('Logger', hooks);

export {getHooks, withHooks};
