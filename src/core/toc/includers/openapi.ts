import type {Build} from '~/commands/build';
import type {RawToc} from '~/core/toc';

import {dirname, join} from 'node:path';
import {includer} from '@diplodoc/openapi-extension/includer';

// TODO: move to openapi-extension on major
export class OpenapiIncluderExtension {
    apply(program: Build) {
        program.hooks.BeforeAnyRun.tap('OpenapiIncluder', (run) => {
            run.toc.hooks.Includer.for('openapi').tapPromise(
                'OpenapiIncluder',
                async (_toc, options, path) => {
                    // @ts-ignore
                    const {toc, files} = await includer(run, options, path);

                    const root = join(run.input, dirname(options.path));
                    for (const {path, content} of files) {
                        await run.write(join(root, path), content);
                    }

                    // @ts-ignore
                    return toc as RawToc;
                },
            );
        });
    }
}
