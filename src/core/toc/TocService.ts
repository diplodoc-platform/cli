import type {BuildConfig, Run} from '~/commands/build';
import type {IncludeInfo, RawToc, Toc, TocItem, WithItems} from './types';
import type {LoaderContext} from './loader';

import {ok} from 'node:assert';
import {basename, dirname, join, relative} from 'node:path';
import {dump, load} from 'js-yaml';

import {freeze, isExternalHref, normalizePath, own} from '~/utils';
import {Stage} from '~/constants';

import {Hooks, hooks} from './hooks';
import {isMergeMode, loader} from './loader';

export type TocServiceConfig = {
    ignore: BuildConfig['ignore'];
    ignoreStage: BuildConfig['ignoreStage'];
    template: BuildConfig['template'];
    removeHiddenTocItems: BuildConfig['removeHiddenTocItems'];
};

type WalkStepResult<I> = I | I[] | null | undefined;

export class TocService {
    readonly [Hooks] = hooks();

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
            mode: include?.mode,
            from: include?.from || path,
            path,
            mergeBase: include?.mergeBase,
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

        if (include && isMergeMode(include.mode)) {
            const from = normalizePath(dirname(path));
            const to = normalizePath(include.mergeBase as RelativePath);

            context.path = context.path.replace(from, to) as RelativePath;
            context.from = include?.from || context.path;

            await this.run.copy(join(this.run.input, from), join(this.run.input, to), {
                sourcePath: (file: string) => file.endsWith('.md'),
                ignore: [basename(file), '**/toc.yaml'],
            });
        }

        const toc = (await loader.call(context, content)) as Toc;

        // If this is a part of other toc.yaml
        if (include) {
            await this[Hooks].Included.promise(toc, path, include);
        } else {
            // TODO: we don't need to store tocs in future
            // All processing should subscribe on toc.hooks.Resolved
            this.tocs.set(path as NormalizedPath, toc);
            await this.walkItems([toc], (item: TocItem | Toc) => {
                if (own<string, 'href'>(item, 'href') && !isExternalHref(item.href)) {
                    this._entries.add(normalizePath(join(dirname(path), item.href)));
                }

                return item;
            });

            await this[Hooks].Resolved.promise(freeze(toc), path);
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
