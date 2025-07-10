import type {BaseProgram, IExtension} from '@diplodoc/cli/lib/program';
import type {Run as BaseRun} from '@diplodoc/cli/lib/run';
import type {RawToc, TocService} from '@diplodoc/cli/lib/toc';

import {dirname, join} from 'node:path';
import {includer} from '@diplodoc/openapi-extension/includer';

import {getHooks as getBaseHooks} from '@diplodoc/cli/lib/program';
import {getHooks as getTocHooks} from '@diplodoc/cli/lib/toc';

type Run = BaseRun & {
    toc?: TocService;
};

const EXTENSION = 'OpenapiIncluder';
const INCLUDER = 'openapi';

// TODO: move to openapi-extension on major
export class Extension implements IExtension {
    apply(program: BaseProgram) {
        getBaseHooks(program).BeforeAnyRun.tap(EXTENSION, (run: Run) => {
            getTocHooks(run.toc)
                .Includer.for(INCLUDER)
                .tapPromise(EXTENSION, async (rawtoc, options) => {
                    // @ts-ignore
                    const {toc, files} = await includer(run, options, rawtoc.path);

                    const root = join(run.input, dirname(options.path));
                    for (const {path, content} of files) {
                        await run.write(join(root, path), content, true);
                    }

                    // @ts-ignore
                    return toc as RawToc;
                });
        });
    }
}
