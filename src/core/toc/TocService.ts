import type {Run as BaseRun} from '~/core/run';
import type {VarsService} from '~/core/vars';
import type {MetaService} from '~/core/meta';
import type {IncludeInfo, RawToc, Toc, WithItems} from './types';
import type {LoaderContext} from './loader';

import {basename, dirname, join, relative} from 'node:path';
import {dump, load} from 'js-yaml';
import {dedent} from 'ts-dedent';

import {
    Defer,
    VFile,
    bounded,
    copyJson,
    errorMessage,
    isExternalHref,
    memoize,
    normalizePath,
    own,
} from '~/core/utils';

import {getHooks, withHooks} from './hooks';
import {isMergeMode, loader} from './loader';

export type TocServiceConfig = {
    ignore: string[];
    ignoreStage: string[];
    template: {
        enabled: boolean;
        features: {
            conditions: boolean;
            substitutions: boolean;
        };
        scopes: {
            code: boolean;
            text: boolean;
        };
    };
    removeHiddenTocItems: boolean;
};

type WalkStepResult<I> = I | I[] | null | undefined;

type WalkOptions<T> = {
    accept: (item: T) => boolean;
};

type Run = BaseRun<TocServiceConfig> & {
    vars: VarsService;
    meta: MetaService;
};

@withHooks
export class TocService {
    readonly name = 'Toc';

    get entries() {
        return [...this._entries];
    }

    get tocs() {
        return [...this._tocs.entries()].filter(([, toc]) => toc !== false) as [
            NormalizedPath,
            Toc,
        ][];
    }

    private run: Run;

    private logger: Run['logger'];

    private config: TocServiceConfig;

    private _entries: Set<NormalizedPath> = new Set();

    private _tocs: Map<NormalizedPath, Toc | boolean> = new Map();

    private processed: Hash<boolean> = {};

    private cache: Map<NormalizedPath, Toc | Promise<Toc | undefined> | undefined> = new Map();

    private get vars() {
        return this.run.vars;
    }

    private get meta() {
        return this.run.meta;
    }

    constructor(run: Run) {
        this.run = run;
        this.logger = run.logger;
        this.config = run.config;
    }

    @bounded async load(path: RelativePath): Promise<Toc | undefined> {
        const file = normalizePath(path);

        // There is no error. We really skip toc processing, if it was processed previously in any way.
        // For example toc can be processed as include of some other toc.
        if (this.processed[file]) {
            return this.cache.get(file);
        }

        this.processed[file] = true;

        this.logger.proc(file);

        const defer = new Defer<Toc | undefined>();

        this.cache.set(file, defer.promise);

        defer.promise.then((result) => {
            if (this.cache.has(file)) {
                this.cache.set(file, result);
            }
        });

        const context: LoaderContext = this.loaderContext(file);

        const content = await read(this.run, file);

        if (this.shouldSkip(content)) {
            this.cache.delete(file);
            defer.resolve(undefined);
            return undefined;
        }

        const toc = (await loader.call(context, content)) as Toc;

        toc.path = file;

        await getHooks(this).Loaded.promise(toc, file);

        // This looks how small optimization, but there was cases when toc is an array...
        // This is not that we expect.
        if (toc.href || toc.items?.length) {
            await this.walkEntries([toc as {href: NormalizedPath}], (item) => {
                this._entries.add(normalizePath(join(dirname(path), item.href)));

                if (own<string, 'restricted-access'>(item, 'restricted-access')) {
                    this.run.meta.add(normalizePath(join(dirname(path), item.href)), {
                        'restricted-access': item['restricted-access'],
                    });
                }

                return item;
            });
        }

        defer.resolve(toc);

        this._tocs.set(file, toc);

        return defer.promise;
    }

    @bounded async include(path: RelativePath, include: IncludeInfo): Promise<Toc | undefined> {
        const file = normalizePath(path);

        this.processed[file] = true;
        this._tocs.set(file, false);

        this.logger.proc(file);

        const context: LoaderContext = await this.loaderContext(file, include);

        const content = include.content || (await read(this.run, file, include.from));

        if (this.shouldSkip(content)) {
            return undefined;
        }

        if (isMergeMode(include)) {
            const from = normalizePath(dirname(file));
            const to = normalizePath(dirname(include.base));

            context.vars = this.vars.for(include.base);
            context.path = context.path.replace(from, to) as NormalizedPath;
            context.from = include.from;

            const files = await this.run.copy(
                join(this.run.input, from),
                join(this.run.input, to),
                [basename(file), '**/toc.yaml'],
            );

            for (const [from, to] of files) {
                this.logger.copy(from, to);
                this.meta.add(relative(this.run.input, to), {
                    sourcePath: relative(this.run.input, from),
                });
            }
        }

        const toc = (await loader.call(context, content)) as Toc;

        await getHooks(this).Included.promise(toc, file, include);

        return toc;
    }

    @bounded
    @memoize('path')
    async dump(file: NormalizedPath, toc?: Toc): Promise<VFile<Toc>> {
        toc = toc || (await this.load(file));

        const vfile = new VFile<Toc>(file, copyJson(toc), dump);

        return getHooks(this).Dump.promise(vfile);
    }

    /**
     * Visits items which will be project entries. Applies actor to each item.
     * Then applies actor to each item in actor result.items.
     * Returns actor results.
     */
    async walkEntries<T extends WithItems<T> & {href: NormalizedPath}>(
        items: T[] | undefined,
        actor: (item: T) => Promise<WalkStepResult<T>> | WalkStepResult<T>,
    ): Promise<T[] | undefined> {
        return this.walkItems(items, actor, {
            accept: (item) => own<string, 'href'>(item, 'href') && !isExternalHref(item.href),
        });
    }

    /**
     * Visits all passed items. Applies actor to each item.
     * Then applies actor to each item in actor result.items.
     * Returns actor results.
     */
    async walkItems<T extends WithItems<T>>(
        items: T[] | undefined,
        actor: (item: T) => Promise<WalkStepResult<T>> | WalkStepResult<T>,
        options: WalkOptions<T> = {accept: () => true},
    ): Promise<T[] | undefined> {
        const {accept} = options;
        if (!items || !items.length) {
            return items;
        }

        let results: T[] = [];
        const queue = items.slice();
        while (queue.length) {
            const item = queue.shift() as T;

            const result = accept(item) ? await actor(item) : item;
            if (result) {
                results = results.concat(result);
            }
        }

        for (const result of results) {
            if (own(result, 'items')) {
                // Sometime users defines items as object (one item) instead of array of one item.
                if (!Array.isArray(result.items) && result.items) {
                    result.items = ([] as T[]).concat(result.items);
                }

                if (result.items?.length) {
                    result.items = await this.walkItems(result.items, actor, options);
                }
            }
        }

        return results;
    }

    /**
     * Sets data for target toc path.
     */
    set(path: NormalizedPath, toc: Toc) {
        this.processed[path] = true;
        this.cache.set(path, toc);
    }

    /**
     * Resolves toc path and data for any page path.
     * Expects what all paths are already loaded in service.
     */
    for(path: RelativePath): NormalizedPath {
        path = normalizePath(path);

        const tocPath = normalizePath(join(dirname(path), 'toc.yaml'));

        if (this.cache.has(tocPath as NormalizedPath)) {
            return tocPath;
        }

        const nextPath = dirname(path);

        if (path === nextPath) {
            throw new Error('Error while finding toc dir.');
        }

        return this.for(nextPath);
    }

    private shouldSkip(toc: RawToc) {
        const {ignoreStage} = this.config;
        if (toc.stage && ignoreStage.length && ignoreStage.includes(toc.stage)) {
            return true;
        }

        return false;
    }

    private loaderContext(path: NormalizedPath, {from, mode, base}: Partial<IncludeInfo> = {}) {
        return {
            path,
            from: from || path,
            mode,
            base,
            vars: this.vars.for(path),
            toc: this,
            logger: this.logger,
            settings: {
                conditions: this.config.template.features.conditions,
                substitutions: this.config.template.features.substitutions,
            },
            options: {
                removeHiddenItems: this.config.removeHiddenTocItems,
            },
        };
    }
}

async function read(run: Run, path: RelativePath, from?: string): Promise<RawToc> {
    try {
        return load((await run.read(join(run.input, path))) || '{}') as RawToc;
    } catch (error) {
        throw new Error(dedent`
            Unable to resolve ${path}${from ? ' from ' + from : ''}.
            Original error:
                ${errorMessage(error)}
        `);
    }
}
