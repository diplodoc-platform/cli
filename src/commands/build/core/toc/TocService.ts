import type { BuildConfig, Run } from '~/commands/build';
import type { IncluderOptions, RawToc, RawTocItem, WithItems } from './types';

import { ok } from 'node:assert';
import { basename, dirname, join } from 'node:path';
import { dump, load } from 'js-yaml';
import { AsyncParallelHook, AsyncSeriesWaterfallHook, HookMap } from 'tapable';
import { freeze, intercept, isExternalHref, own } from '~/utils';

import loader, {IncludeMode, LoaderContext} from './loader';

export type TocServiceConfig = {
    ignoreStage: BuildConfig['ignoreStage'];
    template: BuildConfig['template'];
    removeHiddenTocItems: BuildConfig['removeHiddenTocItems'];
};

type WalkStepResult = RawTocItem | RawTocItem[] | void;

type TocServiceHooks = {
    /**
     * Called before item data processing (but after data interpolation)
     */
    Item: AsyncSeriesWaterfallHook<[RawTocItem, RelativePath]>;
    Includer: HookMap<AsyncSeriesWaterfallHook<[RawToc, IncluderOptions, RelativePath]>>;
    Resolved: AsyncParallelHook<[Toc, RelativePath]>;
    Included: AsyncParallelHook<[Toc, LoadFrom]>;
};

type IncludeInfo = {
    from: RelativePath;
    mode: IncludeMode;
    mergeBase?: RelativePath;
};

// TODO: addSourcePath(fileContent, sourcePath);
export class TocService {
    hooks: TocServiceHooks;

    private run: Run;

    private logger: Run['logger'];

    private vars: Run['vars'];

    private config: TocServiceConfig;

    private tocs: Map<RelativePath, Toc> = new Map();

    private entries: Set<RelativePath> = new Set();

    constructor(run: Run) {
        this.run = run;
        this.logger = run.logger;
        this.vars = run.vars;
        this.config = run.config;
        this.hooks = intercept('TocService', {
            Item: new AsyncSeriesWaterfallHook(['item', 'path']),
            Includer: new HookMap(() => new AsyncSeriesWaterfallHook(['toc', 'options', 'path'])),
            Resolved: new AsyncParallelHook(['toc', 'path']),
            Included: new AsyncParallelHook(['toc', 'from']),
        });
    }

    // TODO: remove after metadate refactoring
    async realpath(path: RelativePath) {
        return this.run.realpath(join(this.run.input, path));
    }

    async load(path: RelativePath, include?: IncludeInfo) {
        this.logger.proc(path);

        const file = join(this.run.input, path);

        ok(file.startsWith(this.run.input), `Requested toc '${file}' is out of project scope.`);

        const context: LoaderContext = {
            root: this.run.input,
            mode: include?.mode || IncludeMode.RootMerge,
            base: include?.from,
            mergeBase: include?.mergeBase,
            path,
            vars: await this.vars.load(path),
            toc: this,
            options: {
                ignoreStage: this.config.ignoreStage,
                resolveConditions: this.config.template.features.conditions,
                resolveSubstitutions: this.config.template.features.substitutions,
                removeHiddenItems: this.config.removeHiddenTocItems,
            },
        };

        const content = load(await this.run.read(file)) as RawToc;

        if (include && [IncludeMode.RootMerge, IncludeMode.Merge].includes(include.mode)) {
            const from = dirname(file);
            const to = join(this.run.input, include.mergeBase || dirname(include.from));
            await this.run.copy(from, to, [basename(file)]);
        }

        const toc = await loader.call(context, content);

        // If this is not a part of other toc.yaml
        if (!include) {
            // TODO: we don't need to store tocs in future
            // All processing should subscribe on toc.hooks.Resolved
            this.tocs.set(path, toc);
            await this.walkItems([toc], (item) => {
                if (own(item, 'href') && !isExternalHref(item.href)) {
                    this.entries.add(join(dirname(path), item.href));
                }

                return item;
            });

            freeze(toc);

            await this.hooks.Resolved.promise(toc, path);
        } else {
            await this.hooks.Included.promise(toc, include);
        }

        return toc;
    }

    dump(toc: Toc) {
        return dump(toc);
    }

    async walkItems<T extends RawTocItem[] | undefined>(
        items: T,
        actor: (item: RawTocItem) => Promise<WalkStepResult> | WalkStepResult,
    ): Promise<T> {
        if (!items || !items.length) {
            return items;
        }

        const results: RawTocItem[] = [];
        const queue = [...items];
        while (queue.length) {
            const item = queue.shift() as RawTocItem;

            const result = await actor(item);
            if (result !== undefined) {
                if (Array.isArray(result)) {
                    results.push(...result);
                } else {
                    results.push(result);
                }
            }

            if (hasItems(result)) {
                result.items = await this.walkItems(result.items, actor);
            }
        }

        return results as T;
    }

    /**
     * Resolves toc path and data for any page path
     *
     * @param {RelativePath} path - any page path
     *
     * @returns [RelativePath, Toc]
     */
    for(path: RelativePath): [RelativePath, Toc] {
        // TODO: assert relative

        if (!path) {
            throw new Error('Error while finding toc dir.');
        }

        const tocPath = join(dirname(path), 'toc.yaml');

        if (this.tocs.has(tocPath)) {
            return [tocPath, this.tocs.get(tocPath)];
        }

        return this.for(dirname(path));
    }

    async applyIncluder(path: RelativePath, name: string, options: IncluderOptions) {
        const hook = this.hooks.Includer.get(name);

        ok(hook, `Includer with name '${name}' is not registered.`);

        const toc = await hook.promise({}, options, path);

        await this.run.write(
            join(this.run.input, options.path),
            this.run.toc.dump(toc)
        );
    }
}

function hasItems(item: any): item is WithItems {
    return item && typeof item === 'object' && item.items && item.items.length;
}
