import type {Run as BaseRun} from '~/core/run';
import type {VarsService} from '~/core/vars';
import type {IncludeInfo, RawToc, Toc, TocItem, WithItems} from './types';
import type {LoaderContext} from './loader';

import {ok} from 'node:assert';
import {basename, dirname, join} from 'node:path';
import {load} from 'js-yaml';
import {dedent} from 'ts-dedent';

import {bounded, errorMessage, freezeJson, isExternalHref, normalizePath, own} from '~/core/utils';

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
};

@withHooks
export class TocService {
    readonly name = 'Toc';

    get entries() {
        return [...this._entries];
    }

    private run: Run;

    private logger: Run['logger'];

    private vars: Run['vars'];

    private config: TocServiceConfig;

    private _entries: Set<NormalizedPath> = new Set();

    private processed: Hash<boolean> = {};

    private cache: Map<NormalizedPath, Toc | undefined> = new Map();

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

    @bounded async load(path: RelativePath, include?: IncludeInfo): Promise<Toc | undefined> {
        path = normalizePath(path);

        // There is no error. We really skip toc processing, if it was processed previously in any way.
        // For example toc can be processed as include of some other toc.
        if (!include && this.processed[path]) {
            return this.cache.get(path as NormalizedPath);
        }

        this.processed[path] = true;

        this.logger.proc(path);

        const file = join(this.run.input, path);

        ok(file.startsWith(this.run.input), `Requested toc '${file}' is out of project scope.`);

        const context: LoaderContext = {
            mode: include?.mode,
            from: include?.from || path,
            path,
            base: include?.base,
            vars: await this.vars.load(path),
            toc: this,
            options: {
                resolveConditions: this.config.template.features.conditions,
                resolveSubstitutions: this.config.template.features.substitutions,
                removeHiddenItems: this.config.removeHiddenTocItems,
            },
        };

        const content = include?.content || (await read(this.run, path, include?.from));

        // Should ignore included toc with tech-preview stage.
        // TODO(major): remove this
        if (content && content.stage === Stage.TECH_PREVIEW) {
            return undefined;
        }

        const {ignoreStage} = this.config;
        if (content.stage && ignoreStage.length && ignoreStage.includes(content.stage)) {
            return undefined;
        }

        if (include && isMergeMode(include)) {
            const from = normalizePath(dirname(path));
            const to = normalizePath(dirname(include.base));

            context.vars = await this.vars.load(include.base);
            context.path = context.path.replace(from, to) as RelativePath;
            context.from = include.from;

            await this.run.copy(join(this.run.input, from), join(this.run.input, to), {
                sourcePath: (file: string) => file.endsWith('.md'),
                ignore: [basename(file), '**/toc.yaml'],
            });
        }

        const toc = (await loader.call(context, content)) as Toc;

        // If this is a part of other toc.yaml
        if (include) {
            await getHooks(this).Included.promise(toc, path, include);

            return toc;
        }

        this.cache.set(path as NormalizedPath, toc);

        await this.walkItems([toc], (item: TocItem | Toc) => {
            if (own<string, 'href'>(item, 'href') && !isExternalHref(item.href)) {
                this._entries.add(normalizePath(join(dirname(path), item.href)));
            }

            return item;
        });

        await getHooks(this).Resolved.promise(freezeJson(toc), path);

        return toc;
    }

    @bounded async dump(path: RelativePath): Promise<Toc> {
        const file = normalizePath(path);
        const toc = await this.load(path);

        ok(toc, `Toc for path ${file} is not resolved.`);

        return await getHooks(this).Dump.promise(toc, file);
    }

    @bounded async getTocItemAccessMeta(path: string): Promise<Record<string, string>> {
        const prop = 'restricted-access';
        const tocPath = this.for(path as RelativePath);
        const langBasePath = path.replace(/\\/g, '/').split('/')[0];
        const fileName = path.replace(`${langBasePath}/`, '');
        const toc = await this.dump(tocPath);

        if (!toc?.items) {
            return {};
        }

        const acc: Record<string, string> = {};

        await this.walkItems(toc.items, (item: TocItem) => {
            if (own(item, prop) && item.href === fileName) {
                acc[prop] = item[prop] as keyof TocItem;
                return;
            }

            if (own(item, prop) && item.items?.length) {
                // eslint-disable-next-line consistent-return
                return {
                    ...item,
                    items: item.items.reduce((res, nested) => {
                        if (!own(nested, prop)) {
                            res.push({
                                ...nested,
                                [prop]: item[prop],
                            });
                        }

                        return res;
                    }, [] as TocItem[]),
                };
            }

            return;
        });

        return acc;
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
}

async function read(run: Run, path: RelativePath, from: string | undefined): Promise<RawToc> {
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
