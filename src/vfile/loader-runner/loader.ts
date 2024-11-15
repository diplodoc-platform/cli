import { Loader, LoaderOptions } from './LoaderClass';

class LoadingLoaderError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LoaderRunnerError';
        Error.captureStackTrace(this, this.constructor);
    }
}

export type LoaderData = [ LoaderOptions, Hash ];

export function loader(options: LoaderOptions, module: Hash): Loader
export function loader(options: LoaderData, module: any): Loader
export function loader(options: any, module: any): Loader {
    if (Array.isArray(options)) {
        ([ options, module ] = options);
    }

    return fill(new Loader(options), module);
}

type LoaderModule = {
    default?: Loader['normal'];
    pitch?: Loader['pitch'];
    raw?: Loader['raw'];
};
type Module = Extract<Loader['normal'], undefined> & LoaderModule | LoaderModule;

function fill(loader: Loader, module: Module) {
    if (typeof module !== 'function' && typeof module !== 'object') {
        throw new LoadingLoaderError(
            'Module \'' + loader.path + '\' is not a loader (export function or es6 module)'
        );
    }

    loader.normal = typeof module === 'function' ? module : module.default;
    loader.pitch = module.pitch;
    loader.raw = module.raw;

    if (typeof loader.normal !== 'function' && typeof loader.pitch !== 'function') {
        throw new LoadingLoaderError(
            'Module \'' + loader.path + '\' is not a loader (must have normal or pitch function)'
        );
    }

    return loader;
}