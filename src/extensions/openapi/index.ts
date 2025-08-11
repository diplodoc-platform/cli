import type {BaseProgram, IExtension} from '@diplodoc/cli/lib/program';
import type {Run as BaseRun} from '@diplodoc/cli/lib/run';
import type {RawToc, TocService} from '@diplodoc/cli/lib/toc';

import {dirname, join} from 'node:path';
import {includer} from '@diplodoc/openapi-extension/includer';

import {getHooks as getBaseHooks} from '@diplodoc/cli/lib/program';
import {getHooks as getTocHooks} from '@diplodoc/cli/lib/toc';
import {normalizePath} from '@diplodoc/cli/lib/utils';

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
                .tapPromise(EXTENSION, async (rawtoc, options, from) => {
                    const input = normalizePath(options.input);
                    run.toc!.relations.addNode(input, {type: 'generator', data: undefined});
                    // TODO: We need to add this node in TocService only
                    run.toc!.relations.addNode(rawtoc.path, {type: 'source', data: undefined});
                    run.toc!.relations.addDependency(rawtoc.path, input);
                    // @ts-ignore
                    const {toc, files} = await includer(run, options, from);

                    const root = join(run.input, dirname(options.path));
                    for (const {path, content} of files) {
                        await run.write(join(root, path), content, true);
                    }

                    await run.toc!.walkEntries([toc], async (entry) => {
                        const path = normalizePath(join(dirname(options.path), entry.href));
                        run.toc!.relations.addNode(path, {type: 'entry', data: undefined});
                        run.toc!.relations.addDependency(input, path);

                        return entry;
                    });

                    // @ts-ignore
                    return toc as RawToc;
                });
        });
    }
}
