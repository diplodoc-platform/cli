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
