import type { LoaderData } from './loader';
import { LoaderContext } from './LoaderContext';
import { dirname } from 'path';
import { runSyncOrAsync } from './runSyncOrAsync';
import { pargs, utf8BufferToString, parsePathQueryFragment } from './utils';

export type MultiResultCallback<R extends any[] = any[]> = (error?: Error | null, ...results: R) => void;

function convertArgs(args: any[], raw: boolean | undefined) {
    if (!raw && Buffer.isBuffer(args[0])) {
        args[0] = utf8BufferToString(args[0]);
    } else if (raw && typeof args[0] === 'string') {
        args[0] = Buffer.from(args[0], 'utf-8');
    }
}

type LifecycleOptions = {
    resourceBuffer: string | Buffer | null,
    processResource: (
        context: LoaderContext,
        resource: string,
        callback: NodeCallback
    ) => void
}

async function iteratePitchingLoaders(
    options: LifecycleOptions,
    loaderContext: LoaderContext
): Promise<NormalLoaderResults> {
    // abort after last loader
    if (loaderContext.loaderIndex >= loaderContext.loaders.length) {
        return processResource(options, loaderContext);
    }

    const currentLoaderObject = loaderContext.loaders[loaderContext.loaderIndex];

    // iterate
    if (currentLoaderObject.pitchExecuted) {
        loaderContext.loaderIndex++;
        return iteratePitchingLoaders(options, loaderContext);
    }

    currentLoaderObject.pitchExecuted = true;

    const fn = currentLoaderObject.pitch;
    if (!fn) {
        return iteratePitchingLoaders(options, loaderContext);
    }

    const runArgs = [
        loaderContext.remainingRequest,
        loaderContext.previousRequest,
        currentLoaderObject.data = {}
    ];
    const args = await pargs(runSyncOrAsync, fn, loaderContext, runArgs);
    const hasArg = args.some(function(value) {
        return value !== undefined;
    });

    // Determine whether to continue the pitching process based on
    // argument values (as opposed to argument presence) in order
    // to support synchronous and asynchronous usages.
    if (hasArg) {
        loaderContext.loaderIndex--;

        return iterateNormalLoaders(options, loaderContext, args as NormalLoaderResults);
    } else {
        return iteratePitchingLoaders(options, loaderContext);
    }
}

async function processResource(
    options: LifecycleOptions,
    loaderContext: LoaderContext
): Promise<NormalLoaderResults> {
    // set loader index to last loader
    loaderContext.loaderIndex = loaderContext.loaders.length - 1;

    const resourcePath = loaderContext.resourcePath;
    if (resourcePath) {
        const args = await pargs(options.processResource, loaderContext, resourcePath) as [ string | Buffer ];

        options.resourceBuffer = args[0];

        return iterateNormalLoaders(options, loaderContext, args);
    } else {
        // @ts-ignore
        return iterateNormalLoaders(options, loaderContext, [ null ]);
    }
}

type NormalLoaderResults =
    [ string | Buffer ] |
    [ string | Buffer, SourceMap ] |
    [ string | Buffer, SourceMap | undefined, any ];

async function iterateNormalLoaders(
    options: LifecycleOptions,
    loaderContext: LoaderContext,
    args: NormalLoaderResults
): Promise<NormalLoaderResults> {
    if (loaderContext.loaderIndex < 0) {
        return args;
    }

    const currentLoaderObject = loaderContext.loaders[loaderContext.loaderIndex];

    // iterate
    if (currentLoaderObject.normalExecuted) {
        loaderContext.loaderIndex--;
        return iterateNormalLoaders(options, loaderContext, args);
    }

    const fn = currentLoaderObject.normal;
    currentLoaderObject.normalExecuted = true;

    if (!fn) {
        return iterateNormalLoaders(options, loaderContext, args);
    }

    convertArgs(args, currentLoaderObject.raw);

    const results = await pargs(runSyncOrAsync, fn, loaderContext, args) as NormalLoaderResults;

    return iterateNormalLoaders(
        options,
        loaderContext,
        results
    );
}

export function getContext(resource: string) {
    const path = parsePathQueryFragment(resource).path;

    return dirname(path);
}

export type Options = {
    resource?: string;
    loaders?: LoaderData[];
    context?: Record<string | symbol | number, any>;
    readResource: (
        path: string,
        callback: NodeCallback<string | Buffer>
    ) => void;
    processResource?: LifecycleOptions['processResource']
}

function fromContext(context: LoaderContext) {
    return {
        cacheable: context.requestCacheable,
        fileDependencies: context.getDependencies(),
        missingDependencies: context.getMissingDependencies()
    };
}

type Result = ReturnType<typeof fromContext> & {
    result?: NormalLoaderResults;
};

export async function runLoaders(options: Options): Promise<[ Error | null, Result ]> {
    const {
        resource = '',
        loaders = [],
        context: extras = {},
        readResource,
        processResource = (context, resource, callback) => {
            context.addDependency(resource);
            readResource(resource, callback);
        }
    } = options;

    const context = Object.assign(extras, new LoaderContext(resource, loaders)) as LoaderContext;

    // finish loader context
    if (Object.preventExtensions) {
        Object.preventExtensions(context);
    }

    try {
        const results = await iteratePitchingLoaders({
            resourceBuffer: null,
            processResource
        }, context);

        return [ null, {
            ...fromContext(context),
            result: results,
        } ];
    } catch (error) {
        return [ error as Error, fromContext(context) ];
    }
}
