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
    // The runtime instance is the build `Run`, which exposes the final output dir.
    // `run.input` is a temporary working copy (cleaned after the build), so passthrough
    // artifacts like the spec companion must be written straight to `run.output`.
    output: AbsolutePath;
};

const EXTENSION = 'OpenapiIncluder';
const INCLUDER = 'openapi';

/** Suffix of the standalone OpenAPI spec companion files emitted by the includer. */
const SPEC_COMPANION_SUFFIX = '.openapi.json';

/** Entry recorded for each emitted companion so the build manifest can advertise it. */
export type OpenapiCompanionEntry = {
    /** Lang-relative path of the leading page (without extension), e.g. `ru/api/index`. */
    leadingPage: string;
    /**
     * Lang-relative path of the companion file. The file name is derived from the source spec
     * (`petstore.yaml` -> `petstore.openapi.json`), so it is not necessarily `index.openapi.json`,
     * e.g. `ru/api/petstore.openapi.json`. The viewer must use this exact path.
     */
    companionPath: string;
};

/**
 * Records an emitted companion on the shared `run` so the build-manifest feature can serialize
 * the `leadingPage -> companionPath` mapping. Stored on `run` because the includer hook and the
 * manifest hook run in the same build but live in different modules.
 */
function registerOpenapiCompanion(run: Run, tocPath: string, filePath: string) {
    const companionPath = normalizePath(join(dirname(tocPath), filePath));
    // The companion always sits next to the generated `index.md` leading page in the same
    // directory; its file name is derived from the source spec, so the leading page cannot be
    // recovered by stripping the suffix — it is the sibling `index`.
    const leadingPage = normalizePath(join(dirname(companionPath), 'index'));

    const store = run as Run & {openapiCompanions?: OpenapiCompanionEntry[]};
    if (!Array.isArray(store.openapiCompanions)) {
        store.openapiCompanions = [];
    }

    store.openapiCompanions.push({leadingPage, companionPath});
}

// TODO: move to openapi-extension on major
export class Extension implements IExtension {
    apply(program: BaseProgram) {
        getBaseHooks(program).BeforeAnyRun.tap(EXTENSION, (baseRun) => {
            // The runtime instance is the build `Run` (exposes `output`); the hook only
            // statically guarantees `BaseRun`, so narrow it once here.
            const run = baseRun as Run;
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
                    // The companion is a passthrough artifact (not a TOC entry, not a media asset),
                    // so the md/html pipelines never copy it from the temporary `run.input` to
                    // `run.output`. Write it directly into the final output tree instead.
                    const outputRoot = join(run.output, dirname(options.path));
                    const maxOpenapiIncludeSize =
                        (run.config as Hash)?.content?.maxOpenapiIncludeSize || 0;
                    for (const {path, content} of files) {
                        // The standalone spec companion is gated (ai/outputFormat/size) inside the
                        // includer; here we only persist it and register it in the build manifest.
                        if (path.endsWith(SPEC_COMPANION_SUFFIX)) {
                            await run.write(join(outputRoot, path) as AbsolutePath, content, true);
                            registerOpenapiCompanion(run, options.path, path);
                            continue;
                        }

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
