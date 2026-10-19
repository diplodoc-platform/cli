/* eslint-disable @typescript-eslint/no-explicit-any */
import type {Run} from '~/commands/build/run';
import type {BaseProgram} from '~/core/program';
import type {InputOverlay} from './overlay';

import {dirname, join, relative} from 'node:path';
import {minimatch} from 'minimatch';

import {getHooks} from '~/core/program';
import {getHooks as getLeadingHooks} from '~/core/leading';

import {inside} from './overlay';
import {HtmlResources} from './services/html-resources';

const key = Symbol.for('diplodoc.input-trace');
type Trace = {
    configure(input: string, stage: string, output: string, config: string): void;
    overlay: InputOverlay;
    read(path: string): void;
    probe(path: string): void;
    withoutProbes<T>(action: () => Promise<T>): Promise<T>;
};

/** Adapt only the isolated prepare build; ordinary builds keep their native implementation. */
export class Extension {
    apply(program: BaseProgram) {
        getHooks<Run>(program).BeforeAnyRun.tap(
            {name: 'PrepareCollector', stage: -Infinity},
            (run) => {
                const trace = (globalThis as unknown as Record<symbol, Trace>)[key];
                if (!trace || !process.env.YFM_PREPARE_TRACE || !('toc' in run)) return;
                trace.configure(run.originalInput, run.input, run.output, run.configPath);
                const htmlResources = new HtmlResources(run, trace.probe, (message) =>
                    trace.overlay.rejectUnsupportedRead(message),
                );
                getLeadingHooks(run.leading).Loaded.tapPromise(
                    {name: 'PrepareHtmlResources', stage: Infinity},
                    async (leading, _meta, path) => {
                        if (run.config.outputFormat !== 'html' || leading.blocks) return;
                        // Native plain leading pages insert title/description as HTML; link labels are text.
                        for (const value of [leading.title].concat(leading.description || [])) {
                            await htmlResources.collect(value, path);
                        }
                    },
                );
                const nativeTransform = run.transform.bind(run);
                run.transform = async (...args) => {
                    const result = await nativeTransform(...args);
                    await htmlResources.collect(result[0], args[0]);
                    return result;
                };
                const nativeCopy = run.copy.bind(run);
                const nativeGlob = run.glob.bind(run);
                const nativeRemove = run.remove.bind(run);
                run.remove = (path) =>
                    trace.withoutProbes(() =>
                        trace.overlay.physicalFiles(() => nativeRemove(path)),
                    );
                const nativeInit = run.vars.init.bind(run.vars);
                const ignored = (path: string) =>
                    run.config.ignore.some((pattern) => minimatch(path, pattern, {dot: true}));

                run.copy = async (from, to, ignore = []) => {
                    if (from === run.originalInput && to === run.input) {
                        trace.overlay.inputCopy(ignore);
                        return [];
                    }
                    if (from === run.input && to === run.output) return [];
                    if (from === join(run.input, '_assets') && to === join(run.output, '_assets'))
                        return [];
                    if (trace.overlay.virtual(from) && trace.overlay.virtual(to)) {
                        if (from !== to) trace.overlay.copy(from, to, ignore);
                        return [];
                    }
                    return trace.withoutProbes(() => nativeCopy(from, to, ignore));
                };
                run.glob = async (pattern, options) => {
                    // This exact native ignore excludes every nested TOC, so no child listing is needed.
                    const rootOnly =
                        pattern === '**/toc.yaml' &&
                        options.cwd === run.input &&
                        options.ignore?.some(
                            (value) => value === '**/*/toc.yaml' || value === '*/**/toc.yaml',
                        );
                    let paths: NormalizedPath[];
                    if (rootOnly) {
                        const exists = await trace.withoutProbes(async () =>
                            run.exists(join(run.input, 'toc.yaml')),
                        );
                        paths =
                            !ignored('toc.yaml') && exists ? ['toc.yaml' as NormalizedPath] : [];
                    } else {
                        paths = await trace.withoutProbes(() => nativeGlob(pattern, options));
                    }
                    for (const path of paths) trace.probe(join(options.cwd || process.cwd(), path));
                    return paths;
                };
                run.vars.init = (paths = []) => nativeInit(paths);
                const pending = new Map<string, Promise<unknown>>();
                const presets = async (...paths: (string | undefined)[]) => {
                    const ancestors = new Set<string>();
                    for (const value of paths) {
                        if (!value) continue;
                        let path: string = value;
                        for (;;) {
                            ancestors.add(join(path, 'presets.yaml'));
                            const parent = dirname(path);
                            if (parent === path) break;
                            path = parent;
                        }
                    }
                    await Promise.all(
                        [...ancestors]
                            .filter((path) => !ignored(path))
                            .map(async (path) => {
                                // Native eager initialization sees the original stage, before merge overlays exist.
                                const source = join(run.originalInput, path);
                                if (!(await trace.withoutProbes(async () => run.exists(source))))
                                    return;
                                let promise = pending.get(path);
                                if (!promise) {
                                    promise = trace.overlay.originalPresets(() =>
                                        nativeInit([path as NormalizedPath]),
                                    );
                                    pending.set(path, promise);
                                }
                                await promise;
                            }),
                    );
                };
                const wrap = (
                    service: any,
                    method: string,
                    scopes: (...args: any[]) => (string | undefined)[],
                ) => {
                    const native = service[method];
                    if (typeof native !== 'function')
                        throw new Error(`Prepare requires native ${service.name}.${method}`);
                    service[method] = async (...args: any[]) => {
                        await presets(...scopes(...args));
                        return native.apply(service, args);
                    };
                };
                // Native TOC methods create synchronous vars snapshots before their first read.
                wrap(run.toc, 'load', (path) => [path]);
                wrap(run.toc, 'include', (path, include) => [include.base || path]);
                wrap(run.markdown, 'load', (path, from) => [from || path]);
                wrap(run.leading, 'load', (path) => [path]);

                const nativeGet = run.meta.get.bind(run.meta);
                run.meta.get = (path) => {
                    const original = trace.overlay.metadataSource(join(run.input, path));
                    const source = inside(run.originalInput, original)
                        ? relative(run.originalInput, original)
                        : relative(run.input, original);
                    if (
                        original !== join(run.input, path) &&
                        source !== path &&
                        !source.startsWith('..')
                    ) {
                        trace.probe(original);
                        const meta = nativeGet(source);
                        run.meta.add(path, {sourcePath: meta.vcsPath || meta.sourcePath || source});
                    }
                    return nativeGet(path);
                };
            },
        );
        getHooks<Run>(program).AfterAnyRun.tapPromise('PrepareCollector', async (run) => {
            const trace = (globalThis as unknown as Record<symbol, Trace>)[key];
            if (!trace || !('toc' in run)) return;
            for (const path of run.toc.entries) {
                const service = path.endsWith('.md') ? run.markdown : run.leading;
                const graph = await service.relations(path);
                for (const node of graph.overallOrder()) {
                    if (
                        graph.getNodeData(node)?.type === 'resource' &&
                        !/^(?:[a-z]+:|\/\/|#)/i.test(node)
                    )
                        trace.probe(join(run.input, node));
                }
                for (const asset of await service.assets(path)) {
                    if (asset.path && !/^(?:[a-z]+:|\/\/|#)/i.test(asset.path))
                        trace.probe(join(run.input, asset.path));
                }
            }
        });
    }
}
