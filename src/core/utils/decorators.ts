export function bounded(_originalMethod: unknown, context: ClassMethodDecoratorContext) {
    const methodName = context.name;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context.addInitializer(function (this: any) {
        this[methodName] = this[methodName].bind(this);
    });
}

export function memoize(...props: string[] | [Function]) {
    return function (_originalMethod: unknown, context: ClassMethodDecoratorContext) {
        const methodName = context.name;
        const hash =
            typeof props[0] === 'function'
                ? props[0]
                : function (...args: unknown[]) {
                      const mem = args.slice(0, props.length);
                      if (!mem.every(isPrimitive)) {
                          return null;
                      }

                      return props.map((prop, index) => `${prop}=${mem[index]}`).join('&');
                  };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        context.addInitializer(function (this: any) {
            const cache = new Map();
            const method = this[methodName];

            this[methodName] = function (this: unknown, ...args: unknown[]) {
                const key = hash.call(this, ...args);

                if (key === null) {
                    return method.call(this, ...args);
                }

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
