import { Hook } from 'tapable';

type HookMeta = {
    service: string;
    hook: string;
    name: string;
    type: string;
};

export function intercept<T extends Hash<Hook<any, any>>>(service: string, hooks: T): T {
    for (const [hook, handler] of Object.entries(hooks)) {
        handler.intercept({
            register: (info) => {
                const {type, name, fn} = info;
                const meta = {service, hook, name, type};

                if (type === 'promise') {
                    info.fn = async (...args: any[]) => {
                        try {
                            return await fn(...args);
                        } catch (error) {
                            if (error instanceof Error) {
                                Object.assign(error, {hook: meta});
                            }

                            throw error;
                        }
                    };
                }

                return info;
            }
        });
    }

    return hooks;
}
