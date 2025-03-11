import type {Hook, HookMap} from 'tapable';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Hooks = Hash<Hook<any, any> | HookMap<any>>;

export function generateHooksAccess<THooks extends Hooks>(
    name: string,
    hooks: (name: string) => THooks,
) {
    const Hooks = Symbol(`${name}Hooks`);

    function getHooks(program: object | undefined): THooks {
        return (program && (program as {[Hooks]: THooks})[Hooks]) || hooks('Unknown');
    }

    function withHooks<T extends ClassType>(Target: T, {kind}: ClassDecoratorContext): T | void {
        if (kind !== 'class') {
            throw new TypeError(`Decorator 'withHooks' is not applicable to '${kind}'.`);
        }

        return class extends Target {
            [Hooks] = intercept(this.name, hooks(this.name || name));
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

export function intercept<T extends Hooks>(service: string, hooks: T): T {
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
