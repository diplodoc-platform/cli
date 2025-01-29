import type {Hook, HookMap} from 'tapable';

export function generateHooksAccess<THooks>(name: string, hooks: () => THooks) {
    const Hooks = Symbol(`${name}Hooks`);

    function getHooks(program: object | undefined): THooks {
        return (program && (program as {[Hooks]: THooks})[Hooks]) || hooks();
    }

    function withHooks<T extends ClassType>(Target: T, {kind}: ClassDecoratorContext): T | void {
        if (kind !== 'class') {
            return;
        }

        return class extends Target {
            [Hooks] = hooks();
        };
    }

    return [getHooks, withHooks, Hooks] as const;
}

export type HookMeta = {
    service: string;
    hook: string;
    name: string;
    type: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function intercept<T extends Hash<Hook<any, any> | HookMap<any>>>(
    service: string,
    hooks: T,
): T {
    for (const [hook, handler] of Object.entries(hooks)) {
        handler.intercept({
            register: (info) => {
                const {type, name, fn} = info;
                const meta = {service, hook, name, type};

                if (type === 'promise') {
                    info.fn = async (...args: unknown[]) => {
                        try {
                            return await fn(...args);
                        } catch (error) {
                            if (error instanceof Error) {
                                Object.assign(error, {hook: meta});
                            }

                            throw error;
                        }
                    };
                } else if (type === 'sync') {
                    info.fn = (...args: unknown[]) => {
                        try {
                            return fn(...args);
                        } catch (error) {
                            if (error instanceof Error) {
                                Object.assign(error, {hook: meta});
                            }

                            throw error;
                        }
                    };
                } else {
                    throw new TypeError('Unexpected hook tap type - ' + type);
                }

                return info;
            },
        });
    }

    return hooks;
}
