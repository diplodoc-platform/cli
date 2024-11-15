import type { LoaderContext } from './LoaderContext';
import type { MultiResultCallback } from './runLoaders';

export function runSyncOrAsync(
    fn: (this: LoaderContext, ...args: any[]) => any,
    context: LoaderContext,
    args: any[],
    callback: MultiResultCallback
): void {
    let isSync = true;
    let isDone = false;
    let isError = false; // internal error
    let reportedError = false;

    context.async = function async() {
        if (isDone) {
            if (reportedError) {
                return;
            }

            throw new Error('async(): The callback was already called.');
        }

        isSync = false;

        return innerCallback;
    };

    const innerCallback = context.callback = function(...args) {
        if (isDone) {
            if (reportedError) {
                return;
            }

            throw new Error('callback(): The callback was already called.');
        }

        isDone = true;
        isSync = false;

        try {
            callback.apply(null, args);
        } catch (e) {
            isError = true;
            throw e;
        }
    };

    try {
        const result = (function LOADER_EXECUTION() {
            return fn.apply(context, args);
        }());

        if (isSync) {
            isDone = true;

            if (result === undefined) {
                return callback();
            }

            if (result && typeof result === 'object' && typeof result.then === 'function') {
                return result.then(function(r: string | Buffer) {
                    callback(null, r);
                }, callback);
            }

            return callback(null, result);
        }
    } catch (e) {
        if (isError) {
            throw e;
        }

        if (isDone) {
            // loader is already "done", so we cannot use the callback function
            // for better debugging we print the error on the console
            // @ts-ignore
            console.error(e && typeof e === 'object' && 'stack' in e ? e.stack : e);

            return;
        }

        isDone = true;
        reportedError = true;
        callback(e as Error);
    }

}