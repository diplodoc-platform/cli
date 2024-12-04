import type {BuildConfig, Run} from '~/commands/build';
import type {LoaderContext} from './loader';
import type {RawToc, RawTocItem, WithItems} from './types';

import {ok} from 'node:assert';
import {basename, dirname, join} from 'node:path';
import {dump, load} from 'js-yaml';
import {AsyncParallelHook, AsyncSeriesWaterfallHook} from 'tapable';

import loader, {TocIncludeMode} from './loader';
import {freeze, isExternalHref, own} from '~/utils';

type TocServiceConfig = {
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
    Resolved: AsyncParallelHook<[Toc, RelativePath]>;
    Included: AsyncParallelHook<[Toc, RelativePath, TocIncludeMode]>;
};

// TODO: addSourcePath(fileContent, sourcePath);
export class TocService {
    hooks: TocServiceHooks;

    private run: Run;

    private fs: Run['fs'];

    private logger: Run['logger'];

    private vars: Run['vars'];

    private config: TocServiceConfig;

    private tocs: Map<RelativePath, Toc> = new Map();

    private entries: Set<RelativePath> = new Set();

    constructor(run: Run) {
        this.run = run;
        this.fs = run.fs;
        this.logger = run.logger;
        this.vars = run.vars;
        this.config = run.config;
        this.hooks = {
            Item: new AsyncSeriesWaterfallHook(['item', 'path']),
            Resolved: new AsyncParallelHook(['toc', 'path']),
            Included: new AsyncParallelHook(['toc', 'path', 'mode']),
        };
    }

    async load(path: RelativePath, from?: RelativePath, mode = TocIncludeMode.RootMerge) {
        this.logger.proc(path);

        const file = join(this.run.input, path);

        ok(file.startsWith(this.run.input), `Requested toc '${file}' is out of project scope.`);

        const context: LoaderContext = {
            root: this.run.input,
            path: path,
            vars: await this.vars.load(path),
            toc: this,
            options: {
                ignoreStage: this.config.ignoreStage,
                resolveConditions: this.config.template.features.conditions,
                resolveSubstitutions: this.config.template.features.substitutions,
                removeHiddenItems: this.config.removeHiddenTocItems,
            },
        };

        const content = load(await this.fs.readFile(file, 'utf8')) as RawToc;

        if (from) {
            if (mode === TocIncludeMode.Link) {
                context.base = from;
            }

            if (mode === TocIncludeMode.RootMerge || mode === TocIncludeMode.Merge) {
                await this.run.copy(dirname(file), join(this.run.input, from), [basename(file)]);
            }
        }

        const toc = await loader.call(context, content);

        // If this is not a part of other toc.yaml
        if (!from) {
            freeze(toc);
            // TODO: we don't need to store tocs in future
            // All processing should subscribe on toc.hooks.Resolved
            this.tocs.set(path, toc);
            await this.walkItems([toc], (item) => {
                if (own(item, 'href') && !isExternalHref(item.href)) {
                    this.entries.add(join(dirname(path), item.href));
                }

                return item;
            });

            await this.hooks.Resolved.promise(toc, path);
        } else {
            await this.hooks.Included.promise(toc, from, mode);
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

    async applyIncluder(path: string) {}
}

function hasItems(item: any): item is WithItems {
    return item && typeof item === 'object' && item.items && item.items.length;
}
