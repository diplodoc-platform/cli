import type {BuildConfig, Run} from '~/commands/build';
import type {IncluderOptions, RawToc, RawTocItem, Toc, TocItem, WithItems} from './types';

import {ok} from 'node:assert';
import {basename, dirname, join} from 'node:path';
import {dump, load} from 'js-yaml';
import {AsyncParallelHook, AsyncSeriesWaterfallHook, HookMap} from 'tapable';

import {freeze, intercept, isExternalHref, normalizePath, own} from '~/utils';
import {Stage} from '~/constants';

import {IncludeMode, LoaderContext, loader} from './loader';

export type TocServiceConfig = {
    ignore: BuildConfig['ignore'];
    ignoreStage: BuildConfig['ignoreStage'];
    template: BuildConfig['template'];
    removeHiddenTocItems: BuildConfig['removeHiddenTocItems'];
};

type WalkStepResult<I> = I | I[] | null | undefined;

type TocServiceHooks = {
    /**
     * Called before item data processing (but after data interpolation)
     */
    Item: AsyncSeriesWaterfallHook<[RawTocItem, RelativePath]>;
    /**
     * AsyncSeriesWaterfall HookMap called for each includer name detected in toc.
     * Expects RawToc as result of waterfall.
     */
    Includer: HookMap<AsyncSeriesWaterfallHook<[RawToc, IncluderOptions, RelativePath]>>;
    Resolved: AsyncParallelHook<[Toc, RelativePath]>;
    Included: AsyncParallelHook<[Toc, RelativePath, IncludeInfo]>;
};

type IncludeInfo = {
    from: RelativePath;
    mode: IncludeMode;
    mergeBase?: RelativePath;
    content?: RawToc;
};

export class TocService {
    hooks: TocServiceHooks;

    get entries() {
        return [...this._entries];
    }

    private run: Run;

    private logger: Run['logger'];

    private vars: Run['vars'];

    private config: TocServiceConfig;

    private tocs: Map<NormalizedPath, Toc> = new Map();

    private _entries: Set<NormalizedPath> = new Set();

    private processed: Hash<boolean> = {};

    constructor(run: Run) {
        this.run = run;
        this.logger = run.logger;
        this.vars = run.vars;
        this.config = run.config;
        this.hooks = intercept('TocService', {
            Item: new AsyncSeriesWaterfallHook(['item', 'path']),
            Includer: new HookMap(() => new AsyncSeriesWaterfallHook(['toc', 'options', 'path'])),
            Resolved: new AsyncParallelHook(['toc', 'path']),
            Included: new AsyncParallelHook(['toc', 'path', 'info']),
        });
    }

    async init() {
        const tocs = await this.run.glob('**/toc.yaml', {
            cwd: this.run.input,
            ignore: this.config.ignore,
        });

        for (const toc of tocs) {
            await this.load(toc);
        }
    }

    async load(path: RelativePath, include?: IncludeInfo): Promise<Toc | undefined> {
        path = normalizePath(path);

        // There is no error. We really skip toc processing, if it was processed previously in any way.
        // For example toc can be processed as include of some other toc.
        if (!include && this.processed[path]) {
            return;
        }

        this.processed[path] = true;

        this.logger.proc(path);

        const file = join(this.run.input, path);

        ok(file.startsWith(this.run.input), `Requested toc '${file}' is out of project scope.`);

        const context: LoaderContext = {
            mode: include?.mode || IncludeMode.RootMerge,
            linkBase: include?.from || dirname(path),
            mergeBase: include?.mergeBase,
            path,
            vars: await this.vars.load(path),
            toc: this,
            options: {
                resolveConditions: this.config.template.features.conditions,
                resolveSubstitutions: this.config.template.features.substitutions,
                removeHiddenItems: this.config.removeHiddenTocItems,
            },
        };

        const content = include?.content || (load(await this.run.read(file)) as RawToc);

        // Should ignore included toc with tech-preview stage.
        // TODO(major): remove this
        if (content && content.stage === Stage.TECH_PREVIEW) {
            return;
        }

        const {ignoreStage} = this.config;
        if (content.stage && ignoreStage.length && ignoreStage.includes(content.stage)) {
            return;
        }

        if (include && [IncludeMode.RootMerge, IncludeMode.Merge].includes(include.mode)) {
            const from = dirname(file);
            const to = join(this.run.input, include.mergeBase || dirname(include.from));
            await this.run.copy(from, to, {
                sourcePath: (file: string) => file.endsWith('.md'),
                ignore: [basename(file), '**/toc.yaml'],
            });
        }

        const toc = (await loader.call(context, content)) as Toc;

        // If this is a part of other toc.yaml
        if (include) {
            await this.hooks.Included.promise(toc, path, include);
        } else {
            // TODO: we don't need to store tocs in future
            // All processing should subscribe on toc.hooks.Resolved
            this.tocs.set(path as NormalizedPath, toc);
            await this.walkItems([toc], (item: TocItem | Toc) => {
                if (own<string>(item, 'href') && !isExternalHref(item.href)) {
                    this._entries.add(normalizePath(join(dirname(path), item.href)));
                }

                return item;
            });

            await this.hooks.Resolved.promise(freeze(toc), path);
        }

        // eslint-disable-next-line consistent-return
        return toc;
    }

    dump(toc: Toc | undefined) {
        ok(toc, 'Toc is empty.');

        return dump(toc);
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
            if (own(result, 'items') && result.items?.length) {
                result.items = await this.walkItems(result.items, actor);
            }
        }

        return results;
    }

    /**
     * Resolves toc path and data for any page path.
     * Expects what all paths are already loaded in service.
     */
    for(path: RelativePath): [NormalizedPath, Toc] {
        path = normalizePath(path);

        if (!path) {
            throw new Error('Error while finding toc dir.');
        }

        const tocPath = normalizePath(join(dirname(path), 'toc.yaml'));

        if (this.tocs.has(tocPath as NormalizedPath)) {
            return [tocPath, this.tocs.get(tocPath as NormalizedPath) as Toc];
        }

        return this.for(dirname(path));
    }

    dir(path: RelativePath): NormalizedPath {
        const [tocPath] = this.for(path);

        return normalizePath(dirname(tocPath));
    }
}
