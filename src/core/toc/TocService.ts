import type {Run as BaseRun} from '~/core/run';
import type {VarsService} from '~/core/vars';
import type {MetaService} from '~/core/meta';
import type {IncludeInfo, RawToc, Toc, TocItem, WithItems} from './types';
import type {LoaderContext} from './loader';

import {basename, dirname, join, relative} from 'node:path';
import {load} from 'js-yaml';
import {dedent} from 'ts-dedent';

import {
    Defer,
    bounded,
    copyJson,
    errorMessage,
    freezeJson,
    isExternalHref,
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

enum Stage {
    TECH_PREVIEW = 'tech-preview',
}

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

    private run: Run;

    private logger: Run['logger'];

    private config: TocServiceConfig;

    private _entries: Set<NormalizedPath> = new Set();

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
            this.cache.set(file, result);
        });

        const context: LoaderContext = this.loaderContext(file);

        const content = await read(this.run, file);

        if (this.shouldSkip(content)) {
            this.cache.delete(file);
            defer.resolve(undefined);
            return undefined;
        }

        const toc = (await loader.call(context, content)) as Toc;

        // This looks how small optimization, but there was cases when toc is an array...
        // This is not that we expect.
        if (toc.href || toc.items?.length) {
            await this.walkItems([toc], (item: TocItem | Toc) => {
                if (own<string, 'href'>(item, 'href') && !isExternalHref(item.href)) {
                    this._entries.add(normalizePath(join(dirname(path), item.href)));
                }

                return item;
            });
        }

        defer.resolve(toc);

        await getHooks(this).Resolved.promise(freezeJson(toc), file);

        return defer.promise;
    }

    @bounded async include(path: RelativePath, include: IncludeInfo): Promise<Toc | undefined> {
        const file = normalizePath(path);

        this.processed[file] = true;

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
            context.path = context.path.replace(from, to) as RelativePath;
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

    @bounded async dump(path: RelativePath): Promise<Toc | undefined> {
        const file = normalizePath(path);
        const toc = await this.load(path);

        if (!toc) {
            return;
        }

        return await getHooks(this).Dump.promise(copyJson(toc), file);
    }

    /**
     * Visits all passed items. Applies actor to each item.
     * Then applies actor to each item in actor result.items.
     * Returns actor results.
     */
    async walkItems<T extends WithItems<T>>(
        items: T[] | undefined,
        actor: (item: T) => Promise<WalkStepResult<T>> | WalkStepResult<T>,
    ): Promise<T[] | undefined> {
        if (!items || !items.length) {
            return items;
        }

        const results: T[] = [];
        const queue = [...items];
        while (queue.length) {
            const item = queue.shift() as T;

            const result = await actor(item);
            if (result) {
                results.push(...([] as T[]).concat(result));
            }
        }

        for (const result of results) {
            if (own(result, 'items')) {
                // Sometime users defines items as object (one item) instead of array of one item.
                if (!Array.isArray(result.items) && result.items) {
                    result.items = ([] as T[]).concat(result.items);
                }

                if (result.items?.length) {
                    result.items = await this.walkItems(result.items, actor);
                }
            }
        }

        return results;
    }

    set(path: NormalizedPath, toc: Toc) {
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

    dir(path: RelativePath): NormalizedPath {
        const tocPath = this.for(path);

        return normalizePath(dirname(tocPath));
    }

    private shouldSkip(toc: RawToc) {
        // Should ignore included toc with tech-preview stage.
        // TODO(major): remove this
        if (toc && toc.stage === Stage.TECH_PREVIEW) {
            return true;
        }

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
        return load(await run.read(join(run.input, path))) as RawToc;
    } catch (error) {
        throw new Error(dedent`
            Unable to resolve ${path}${from ? ' from ' + from : ''}.
            Original error:
                ${errorMessage(error)}
        `);
    }
}
