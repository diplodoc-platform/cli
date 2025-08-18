import type {Run as BaseRun} from '~/core/run';
import type {VarsService} from '~/core/vars';
import type {MetaService} from '~/core/meta';
import type {
    EntryTocItem,
    GraphData,
    GraphTocData,
    IncludeInfo,
    RawToc,
    RawTocItem,
    Toc,
    WithItems,
} from './types';
import type {LoaderContext} from './loader';

import {basename, dirname, join, relative} from 'node:path';
import {dump, load} from 'js-yaml';
import {dedent} from 'ts-dedent';

import {
    Defer,
    Graph,
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
    removeEmptyTocItems: boolean;
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

type Options = {
    skipMissingVars: boolean;
    mode: 'translate' | 'build';
};

@withHooks
export class TocService {
    readonly name = 'Toc';

    readonly relations = new Graph<GraphData>();

    get tocs() {
        return (this.relations.overallOrder() as NormalizedPath[]).filter(this.isToc).map(this.for);
    }

    get entries() {
        return (this.relations.overallOrder() as NormalizedPath[]).filter(this.isEntry);
    }

    private run: Run;

    private logger: Run['logger'];

    private config: TocServiceConfig;

    private options;

    private get vars() {
        return this.run.vars;
    }

    private get meta() {
        return this.run.meta;
    }

    constructor(run: Run, options: Options = {skipMissingVars: false, mode: 'build'}) {
        this.run = run;
        this.logger = run.logger;
        this.config = run.config;
        this.options = options;
    }

    async init(paths: NormalizedPath[]) {
        for (const path of paths) {
            await this.load(path);
        }

        return this.tocs.filter((toc) => paths.includes(toc.path));
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
     * Resolves toc path and data for any page path.
     * Expects what all paths are already loaded in service.
     */
    @bounded for(path: RelativePath): Toc {
        const file = normalizePath(path);

        if (this.isToc(file)) {
            return this.relations.getNodeData(file).data as Toc;
        }

        const tocPaths = (this.relations.dependantsOf(file) as NormalizedPath[]).filter(this.isToc);
        if (!tocPaths.length) {
            throw new Error('Error while finding toc dir.');
        }

        if (tocPaths.length === 1) {
            return this.relations.getNodeData(tocPaths[0]).data as Toc;
        }

        const fileParts = normalizePath(join(dirname(file), 'toc.yaml')).split('/');
        const toc = tocPaths.reduce(
            (result, path) => {
                const tocParts = path.split('/');

                let index = 0;
                let score = 0;
                while (tocParts.length > index && fileParts[index] === tocParts[index]) {
                    index++;
                    score++;
                }

                if (score > result.score) {
                    return {score, path};
                }

                return result;
            },
            {score: 0, path: null} as {score: number; path: null | NormalizedPath},
        );

        if (toc.path === null) {
            throw new Error('Error while finding toc dir.');
        }

        return this.relations.getNodeData(toc.path).data as Toc;
    }

    release(path: NormalizedPath) {
        memoize.release(this._dump, path);
    }

    @bounded isToc(path: NormalizedPath) {
        if (!this.relations.hasNode(path)) {
            return false;
        }

        const data = this.relations.getNodeData(path);

        return data.type === 'toc';
    }

    @bounded isEntry(path: NormalizedPath) {
        if (!this.relations.hasNode(path)) {
            return false;
        }

        const data = this.relations.getNodeData(path);

        return data.type === 'entry';
    }

    @bounded isGenerator(path: NormalizedPath) {
        if (!this.relations.hasNode(path)) {
            return false;
        }

        const data = this.relations.getNodeData(path);

        return data.type === 'generator';
    }

    @memoize('path')
    private async _dump(file: NormalizedPath, toc: Toc): Promise<VFile<Toc>> {
        const vfile = new VFile<Toc>(file, copyJson(toc), dump);

        await getHooks(this).Dump.promise(vfile);

        return vfile;
    }

    private async load(file: NormalizedPath): Promise<Toc | undefined> {
        // There is no error. We really skip toc processing, if it was processed previously in any way.
        // For example toc can be processed as include of some other toc.
        if (this.relations.hasNode(file)) {
            return (this.relations.getNodeData(file) as GraphTocData).data;
        }

        this.logger.proc(file);

        const defer = new Defer<Toc | undefined>();

        this.relations.addNode(file, {type: 'toc', data: defer.promise});

        defer.promise.then((result) => {
            if (this.relations.hasNode(file)) {
                this.relations.setNodeData(file, {type: 'toc', data: result});
            }
        });

        const context: LoaderContext = this.loaderContext(file);
        const content = await read(this.run, file);

        content.path = file;

        if (this.shouldSkip(content)) {
            defer.resolve(undefined);
            return undefined;
        }

        const toc = (await loader.call(context, content)) as Toc;

        await getHooks(this).Loaded.promise(toc);

        // This looks how small optimization, but there was cases when toc is an array...
        // This is not that we expect.
        if (toc.href || toc.items?.length) {
            await this.addEntries(file, toc);
            await this.restrictAccess(file, toc);
        }

        defer.resolve(toc);

        return defer.promise;
    }

    @bounded
    private async include(path: RelativePath, include: IncludeInfo): Promise<Toc | undefined> {
        const file = normalizePath(path);

        this.relations.addNode(file);
        this.relations.setNodeData(file, {type: 'source', data: undefined});
        this.relations.addNode(include.from);
        this.relations.addDependency(include.from, file);

        this.logger.proc(file);

        const context: LoaderContext = this.loaderContext(file, include);
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
                normalizePath(join(this.run.input, from)) as AbsolutePath,
                normalizePath(join(this.run.input, to)) as AbsolutePath,
                [basename(file), '**/toc.yaml'],
            );

            for (const pair of files) {
                const [from, to] = pair.map((path) =>
                    normalizePath(relative(this.run.input, path)),
                );
                const sourcePath = this.meta.get(from).sourcePath || from;
                this.meta.add(to, {sourcePath});
                this.logger.copy(pair[0], pair[1]);
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
            const entryPath = normalizePath(join(dirname(path), item.href));
            this.relations.addNode(entryPath, {type: 'entry', data: undefined});
            this.relations.addDependency(toc.path, entryPath);

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
                removeEmptyItems: this.config.removeEmptyTocItems,
                skipMissingVars: this.options.skipMissingVars,
                mode: this.options.mode,
            },
        };
    }
}

async function read(run: Run, path: RelativePath, from?: string): Promise<RawToc> {
    try {
        const source = normalizePath(join(run.input, path)) as AbsolutePath;
        return load((await run.read(source)) || '{}') as RawToc;
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
