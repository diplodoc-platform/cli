export function bounded(_originalMethod: unknown, context: ClassMethodDecoratorContext) {
    const methodName = context.name;

    if (context.private) {
        throw new Error(`'bound' cannot decorate private properties like ${methodName as string}.`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context.addInitializer(function (this: any) {
        this[methodName] = this[methodName].bind(this);
    });
}

export function memoize(...props: string[]) {
    return function (_originalMethod: unknown, context: ClassMethodDecoratorContext) {
        const methodName = context.name;

        context.addInitializer(function (this: any) {
            const cache = new Map();
            const method = this[methodName];

            this[methodName] = function (this: unknown, ...args: unknown[]) {
                const mem = args.slice(props.length);

                if (!mem.every(isPrimitive)) {
                    return method.call(this, ...args);
                }

                const key = props.map((prop, index) => `${prop}=${mem[index]}`).join('&');
                if (!cache.has(key)) {
                    cache.set(key, method.call(this, ...args));
                }

                return cache.get(key);
            };
        });
    };
}

const PRIMITIVE_TYPES = ['string', 'number', 'symbol', 'boolean', 'undefined'];

function isPrimitive(value: unknown) {
    return !value || PRIMITIVE_TYPES.includes(typeof value);
}
