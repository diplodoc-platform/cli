import type {Run} from '@diplodoc/cli/lib/run';
import type {RawToc} from '@diplodoc/cli/lib/toc';

import {dirname, join} from 'node:path';
import SwaggerParser from '@apidevtools/swagger-parser';
import {toFileSystemPath} from '@apidevtools/json-schema-ref-parser/dist/lib/util/url.js';

type Options = {
    input: string;
    tags?: Record<string, {path?: string; hidden?: boolean}>;
};

/** Stage native parser inputs, then select custom pages from its resolved output. */
export async function prepareOpenapiSources(run: Run, options: Options) {
    const input = join(run.input, options.input);
    await SwaggerParser.resolve(input, {
        resolve: {
            file: {
                async read(file: {url: string}) {
                    const path = toFileSystemPath(file.url) as AbsolutePath;
                    await run.materialize(path);
                    return run.read(path);
                },
            },
        },
    });

    const tags = options.tags || {};
    for (const tag of Object.values(tags)) {
        if (!tag.path || tag.hidden) {
            continue;
        }
        const path = join(dirname(input), tag.path);
        // Unselected custom pages may be missing. Native filtering decides which are required.
        const source = run.sources.resolve(path, false);
        if (
            await run.fs.stat(source).then(
                (info) => info.isFile(),
                () => false,
            )
        ) {
            await run.materialize(path, false);
        }
    }

    return async (toc: RawToc, files: {path: string}[]) => {
        const selected = new Set<string>();
        if (!tags.__root__?.hidden && files.some((file) => file.path === 'index.md')) {
            selected.add('__root__');
        }
        for (const item of toc.items || []) {
            if (typeof item.name === 'string' && item.items && !tags[item.name]?.hidden) {
                selected.add(item.name);
            }
        }
        for (const name of selected) {
            const path = tags[name]?.path;
            if (path) {
                await run.depend(join(dirname(input), path));
            }
        }
    };
}
