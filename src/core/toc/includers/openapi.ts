import type {IExtension} from '~/core/program';
import type {Build} from '~/commands/build';
import type {RawToc} from '~/core/toc';

import {dirname, join} from 'node:path';
import {includer} from '@diplodoc/openapi-extension/includer';

import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getTocHooks} from '~/core/toc';

const EXTENSION = 'OpenapiIncluder';
const INCLUDER = 'openapi';

// TODO: move to openapi-extension on major
export class OpenapiIncluderExtension implements IExtension {
    apply(program: Build) {
        getBuildHooks(program).BeforeAnyRun.tap(EXTENSION, (run) => {
            getTocHooks(run.toc)
                .Includer.for(INCLUDER)
                .tapPromise(EXTENSION, async (_toc, options, path) => {
                    // @ts-ignore
                    const {toc, files} = await includer(run, options, path);

                    const root = join(run.input, dirname(options.path));
                    for (const {path, content} of files) {
                        await run.write(join(root, path), content);
                    }

                    // @ts-ignore
                    return toc as RawToc;
                });
        });
    }
}
