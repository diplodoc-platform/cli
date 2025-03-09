import {generateHooksAccess} from '~/core/utils';

export function hooks(_name: string) {
    return {};
}

const [getHooks, withHooks] = generateHooksAccess('Publish', hooks);

export {getHooks, withHooks};
