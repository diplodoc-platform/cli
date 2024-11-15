import type { LoaderData, LoaderOptions } from '../core';
import { pathToFileURL } from 'url';

export async function resolveLoaders(loaders: (LoaderOptions | string)[]): Promise<LoaderData[]> {
    const result:LoaderData[] = [];

    for (const loader of loaders) {
        const loaderType = typeof loader === 'object' && loader.type || 'common';
        const loaderPath = typeof loader === 'object' ? loader.loader : loader;
        const loaderOptions = typeof loader === 'object' ? {...loader} : {};

        result.push([await include(loaderPath, loaderType), loaderOptions]);
    }

    return result;
}

async function include(loader: string, type: string): Promise<LoaderOptions> {
    if (type === 'module') {
        const loaderUrl = pathToFileURL(loader).toString();

        return eval(`import(${ JSON.stringify(loaderUrl) })`);
    } else {
        try {
            return require(loader);
        } catch (error) {
            // it is possible for node to choke on a require if the FD descriptor
            // limit has been reached. give it a chance to recover.
            // @ts-ignore
            if (error instanceof Error && error.code === 'EMFILE') {
                return await immediate(() => require(loader));
            } else {
                throw error;
            }
        }
    }
}

function immediate(action: () => (any | Promise<any>)): Promise<ReturnType<typeof action>> {
    return new Promise((resolve, reject) => {
        setImmediate(async () => {
            try {
                resolve(await action());
            } catch (error) {
                reject(error);
            }
        });
    });
}