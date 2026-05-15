import type {BaseProgram, IExtension} from '@diplodoc/cli/lib/program';
import type {Run as BaseRun} from '@diplodoc/cli/lib/run';
import type {EntryTocItem, RawToc, TocService} from '@diplodoc/cli/lib/toc';

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
                    const service = run.toc as TocService;

                    service.relations.addNode(input, {type: 'generator', data: undefined});
                    // TODO: We need to add this node in TocService only
                    service.relations.addNode(rawtoc.path, {type: 'source', data: undefined});
                    service.relations.addDependency(rawtoc.path, input);
                    // @ts-ignore
                    const {toc, files} = await includer(run, options, from);

                    const root = join(run.input, dirname(options.path));
                    const maxOpenapiIncludeSize =
                        (run.config as Hash)?.content?.maxOpenapiIncludeSize || 0;
                    for (const {path, content} of files) {
                        if (
                            maxOpenapiIncludeSize > 0 &&
                            Buffer.byteLength(content, 'utf-8') > maxOpenapiIncludeSize
                        ) {
                            const stub = [
                                '---',
                                'noIndex: true',
                                '---',
                                '',
                                '{% note warning %}',
                                '',
                                'This page exceeds the maximum allowed size and cannot be displayed.',
                                '',
                                '{% endnote %}',
                            ].join('\n');
                            run.logger.warn(
                                `OpenAPI page ${path} exceeds max-openapi-include-size limit ` +
                                    `(${Buffer.byteLength(content, 'utf-8')} > ${maxOpenapiIncludeSize} bytes). ` +
                                    `Replacing with stub.`,
                            );
                            await run.write(join(root, path), stub, true);
                            continue;
                        }
                        await run.write(join(root, path), content, true);
                    }

                    await service.walkEntries([toc as unknown as EntryTocItem], async (entry) => {
                        const path = normalizePath(join(dirname(options.path), entry.href));
                        service.relations.addNode(path, {type: 'entry', data: undefined});
                        service.relations.addDependency(input, path);

                        return entry;
                    });

                    // @ts-ignore
                    return toc as RawToc;
                });
        });
    }
}
