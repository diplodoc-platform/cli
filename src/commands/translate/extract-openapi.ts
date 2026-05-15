import type {BaseProgram, IExtension} from '@diplodoc/cli/lib/program';
import type {Run as BaseRun} from '@diplodoc/cli/lib/run';
import type {TocService} from '@diplodoc/cli/lib/toc';

import {getHooks as getBaseHooks} from '@diplodoc/cli/lib/program';
import {getHooks as getTocHooks} from '@diplodoc/cli/lib/toc';

type Run = BaseRun & {
    toc?: TocService;
};

const EXTENSION = 'OpenapiIncluder';
const INCLUDER = 'openapi';

export class Extension implements IExtension {
    apply(program: BaseProgram) {
        getBaseHooks(program).BeforeAnyRun.tap(EXTENSION, (run: Run) => {
            getTocHooks(run.toc)
                .Includer.for(INCLUDER)
                .tapPromise(EXTENSION, async (toc) => toc);
        });
    }
}
