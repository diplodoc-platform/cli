import type {Run as BaseRun} from '~/core/run';
import type {VarsService} from '~/core/vars';
import type {MetaService} from '~/core/meta';
import type {EntryTocItem, IncludeInfo, RawToc, Toc, WithItems} from './types';
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
    memoize,
    normalizePath,
    own,
} from '~/core/utils';

import {getHooks, withHooks} from './hooks';
import {isMergeMode, loader} from './loader';
import {isEntryItem} from './utils';

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

export type WalkStepContext<T extends object = {}> = Hash<unknown> & T;

type RestrictedAccessContext = WalkStepContext<{
    'restricted-access'?: string[][];
}>;

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
        return [...this._tocs.values()].filter(Boolean) as Toc[];
    }

    get copymap() {
        return this._copymap;
    }

    private run: Run;

    private logger: Run['logger'];

    private config: TocServiceConfig;

    private _entries: Set<NormalizedPath> = new Set();

    private _tocs: Map<NormalizedPath, Toc | boolean> = new Map();

    private _copymap: Record<NormalizedPath, NormalizedPath> = {};

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

    async init(paths: NormalizedPath[]) {
        for (const path of paths) {
            await this.load(path);
        }
    }

    async dump(file: NormalizedPath, toc?: Toc): Promise<VFile<Toc>> {
        toc = toc || this.for(file);

        return this._dump(toc.path, toc);
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
        return this.walkItems(items, actor, {accept: isEntryItem});
    }

    /**
     * Visits all passed items. Applies actor to each item.
     * Then applies actor to each item in actor result.items.
     * Returns actor results.
     */
    async walkItems<T extends WithItems<T>>(
        items: T[] | undefined,
        actor: (
            item: T,
            context: WalkStepContext,
        ) => Promise<WalkStepResult<T>> | WalkStepResult<T>,
        options: WalkOptions<T> = {accept: () => true},
    ): Promise<T[] | undefined> {
        return this._walkItems(items, actor, options);
    }

    /**
     * Sets data for target toc path.
     */
    setToc(toc: Toc) {
        this.processed[toc.path] = true;
        this.cache.set(toc.path, toc);
    }

    setCopymap(copymap: Record<NormalizedPath, NormalizedPath>) {
        this._copymap = copymap;
    }

    setEntries(entries: NormalizedPath[]) {
        if (!this._entries.size) {
            this._entries = new Set(entries);
        }
    }

    /**
     * Resolves toc path and data for any page path.
     * Expects what all paths are already loaded in service.
     */
    for(path: RelativePath): Toc {
        path = normalizePath(path);

        const tocPath = normalizePath(join(dirname(path), 'toc.yaml'));

        if (this.cache.has(tocPath)) {
            return this.cache.get(tocPath) as Toc;
        }

        const nextPath = dirname(path);

        if (path === nextPath) {
            throw new Error('Error while finding toc dir.');
        }

        return this.for(nextPath);
    }

    @memoize('path')
    private async _dump(file: NormalizedPath, toc: Toc): Promise<VFile<Toc>> {
        const vfile = new VFile<Toc>(file, copyJson(toc), dump);

        await getHooks(this).Dump.promise(vfile);

        return vfile;
    }

    private async load(path: NormalizedPath): Promise<Toc | undefined> {
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

        content.path = file;

        if (this.shouldSkip(content)) {
            this.cache.delete(file);
            defer.resolve(undefined);
            return undefined;
        }

        const toc = (await loader.call(context, content)) as Toc;

        await getHooks(this).Loaded.promise(toc);

        // This looks how small optimization, but there was cases when toc is an array...
        // This is not that we expect.
        if (toc.href || toc.items?.length) {
            await this.addEntries(path, toc);
            await this.restrictAccess(path, toc);
        }

        defer.resolve(toc);

        this._tocs.set(file, toc);

        return defer.promise;
    }

    @bounded
    private async include(path: RelativePath, include: IncludeInfo): Promise<Toc | undefined> {
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

            for (const pair of files) {
                const [from, to] = pair.map((path) =>
                    normalizePath(relative(this.run.input, path)),
                );
                this.meta.add(to, {sourcePath: from});
                this.logger.copy(pair[0], pair[1]);
                this._copymap[from] = to;
            }
        }

        const toc = (await loader.call(context, content)) as Toc;

        await getHooks(this).Included.promise(toc, include);

        return toc;
    }

    /**
     * Visits all passed items. Applies actor to each item.
     * Then applies actor to each item in actor result.items.
     * Returns actor results.
     * DFS
     */
    private async _walkItems<T extends WithItems<T>>(
        items: T[] | undefined,
        actor: (
            item: T,
            context: WalkStepContext,
        ) => Promise<WalkStepResult<T>> | WalkStepResult<T>,
        options: WalkOptions<T>,
        context: Hash = {},
    ): Promise<T[] | undefined> {
        const {accept} = options;

        if (!items || !items.length) {
            return items;
        }

        const results: T[] = [];

        for (const item of items) {
            const itemContext: WalkStepContext = {...context};

            const result = (accept(item) ? await actor(item, itemContext) : item) as T &
                Record<'items', unknown>;

            if (result) {
                results.push(...([] as T[]).concat(result));

                if (own(result, 'items')) {
                    // Sometime users defines items as object (one item) instead of array of one item.
                    if (!Array.isArray(result.items) && result.items) {
                        result.items = ([] as T[]).concat(result.items);
                    }

                    if (result.items?.length) {
                        result.items = await this._walkItems(
                            result.items,
                            actor,
                            options,
                            itemContext,
                        );
                    }
                }
            }
        }

        return results;
    }

    private shouldSkip(toc: RawToc) {
        const {ignoreStage} = this.config;
        if (toc.stage && ignoreStage.length && ignoreStage.includes(toc.stage)) {
            return true;
        }

        return false;
    }

    private async addEntries(path: NormalizedPath, toc: Toc) {
        await this.walkEntries([toc as unknown as EntryTocItem], (item) => {
            const resolvedItemHref = normalizePath(join(dirname(path), item.href));

            this._entries.add(resolvedItemHref);

            return item;
        });
    }

    private async restrictAccess(path: NormalizedPath, toc: Toc) {
        await this.walkItems(
            [toc as unknown as RawTocItem],
            (item, context: RestrictedAccessContext) => {
                if (own<string | string[]>(item, 'restricted-access')) {
                    let itemAccess = ([] as string[]).concat(item['restricted-access'] || []);

                    const contextAccess: string[][] =
                        (context['restricted-access'] as string[][]) ?? [];
                    if (contextAccess.some(isEqualAccess(itemAccess.sort().join(',')))) {
                        itemAccess = [];
                    }

                    if (itemAccess.length > 0) {
                        context['restricted-access'] = [...contextAccess, itemAccess];
                    }
                }

                if (context['restricted-access']?.length && isEntryItem(item)) {
                    const href = normalizePath(join(dirname(path), item.href));
                    this.meta.add(href, {
                        'restricted-access': context['restricted-access'],
                    });
                }

                return item;
            },
        );

        return toc;
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
            include: this.include,
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

function isEqualAccess(match: string) {
    return function (access: string[]) {
        return access.sort().join() === match;
    };
}
