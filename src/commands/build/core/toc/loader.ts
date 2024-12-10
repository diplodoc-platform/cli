import type { TocService } from './TocService';
import { RawToc, RawTocItem, TextFilter } from './types';

import { ok } from 'node:assert';
import { dirname, join, relative } from 'node:path';
import { omit } from 'lodash';
import evalExp from '@diplodoc/transform/lib/liquid/evaluation';
import { liquidSnippet } from '@diplodoc/transform/lib/liquid';

import { Stage } from '~/constants';
import { own } from '~/utils';
import { isRelative } from './utils';

type Toc = {
    title?: string;
    label?: string;
    stage?: string;
    navigation?: boolean | Navigation;
    items?: TocItem[];
};

type TocItem = {
    href: RelativePath;
};

export type {RawToc};

export type LoaderContext = {
    root: AbsolutePath;
    path: RelativePath;
    base?: RelativePath;
    mergeBase?: RelativePath;
    mode: TocIncludeMode;
    vars: Hash;
    options: {
        ignoreStage: string[];
        resolveConditions: boolean;
        resolveSubstitutions: boolean;
        removeHiddenItems: boolean;
    };
    toc: TocService;
};

export enum IncludeMode {
    RootMerge = 'root_merge',
    Merge = 'merge',
    Link = 'link',
}

export default async function (this: LoaderContext, toc: RawToc): Promise<RawToc> {
    const {ignoreStage} = this.options;

    if (toc.stage && ignoreStage.length && ignoreStage.includes(toc.stage)) {
        return toc;
    }

    // Designed to be isolated loaders in future
    toc = await resolveFields.call(this, toc);
    toc = await resolveItems.call(this, toc);
    toc = await templateFields.call(this, toc);
    toc = await processItems.call(this, toc);
    toc = await rebaseItems.call(this, toc);

    return toc;
}

async function resolveFields(this: LoaderContext, toc: RawToc): Promise<RawToc> {
    for (const field of ['title', 'label'] as const) {
        const value = toc[field];
        if (value) {
            toc[field] = getFirstValuable<YfmString>(value, this.vars);
        }
    }

    return toc;
}

async function templateFields(this: LoaderContext, toc: RawToc): Promise<RawToc> {
    const {resolveConditions, resolveSubstitutions} = this.options;
    const interpolate = (box: Hash, field: string) => {
        const value = box[field];
        if (typeof value !== 'string') {
            return;
        }

        box[field] = liquidSnippet(value, this.vars, this.path, {
            substitutions: resolveSubstitutions,
            conditions: resolveConditions,
            keepNotVar: true,
            withSourceMap: false,
        });
    };

    if (!resolveConditions && !resolveSubstitutions) {
        return toc;
    }

    for (const field of ['title', 'label', 'navigation'] as const) {
        interpolate(toc, field);
    }

    toc.items = await this.toc.walkItems(toc.items, (item: RawTocItem) => {
        for (const field of ['name', 'href'] as const) {
            interpolate(item, field);
        }

        return item;
    });

    return toc;
}

async function resolveItems(this: LoaderContext, toc: RawToc): Promise<RawToc> {
    const {removeHiddenItems, resolveConditions} = this.options;

    if (!removeHiddenItems && !resolveConditions) {
        return toc;
    }

    toc.items = await this.toc.walkItems(toc.items, (item: RawTocItem) => {
        let when = true;

        if (resolveConditions) {
            when =
                typeof item.when === 'string' ? evalExp(item.when, this.vars) : item.when !== false;
            delete item.when;
        }

        if (removeHiddenItems) {
            when = when && !item.hidden;
            delete item.hidden;
        }

        return when ? item : undefined;
    });

    return toc;
}

async function rebaseItems(this: LoaderContext, toc: RawToc): Promise<RawToc> {
    if (this.mode !== IncludeMode.Link) {
        return toc;
    }

    const rebase = (item: RawTocItem) => {
        if (own(item, 'href') && isRelative(item.href)) {
            const absBase = join(this.root, dirname(this.base) as RelativePath);
            const absPath = join(this.root, this.mergeBase || dirname(this.path), item.href);

            item.href = relative(absBase, absPath);
        }

        return item;
    };

    if (own(toc, 'href')) {
        rebase(toc as RawTocItem);
    }

    toc.items = await this.toc.walkItems(toc.items, rebase);

    return toc;
}

async function processItems(this: LoaderContext, toc: RawToc): Promise<RawToc> {
    toc.items = await this.toc.walkItems(toc.items, async (item: RawTocItem) => {
        item = await this.toc.hooks.Item.promise(item, this.path);

        if (!own(item, 'include')) {
            return item;
        }

        const {include} = item;

        ok(include.path, 'Invalid value for include path.');

        if (own(item.include, 'includers')) {
            ok(
                include.mode === IncludeMode.Link || !include.mode,
                'Invalid mode value for include with includers.',
            );
            ok(Array.isArray(include.includers), 'Includers should be an array.');

            if (!include.path.endsWith('toc.yaml')) {
                include.path = join(include.path, 'toc.yaml');
            }

            include.mode = IncludeMode.Link;

            const tocPath = join(dirname(this.path), include.path);
            for (const includer of include.includers) {
                ok(includer.name, 'Includer name should be a string.');

                await this.toc.applyIncluder(this.path, includer.name, {
                    ...(omit(includer, 'name')),
                    path: tocPath,
                });
            }
        }

        const {mode = IncludeMode.RootMerge} = include;
        const {mergeBase, path} = this;

        const includeInfo = {
            from: this.path,
            path: join(dirname(path), include.path),
            mode,
            mergeBase
        };

        if ([IncludeMode.RootMerge, IncludeMode.Merge].includes(includeInfo.mode)) {
            includeInfo.mergeBase = includeInfo.mergeBase || dirname(path);
            includeInfo.path = join(includeInfo.mergeBase, include.path);
        }

        const toc = await this.toc.load(includeInfo.path, includeInfo);
        delete (item as RawTocItem).include;

        // Should ignore included toc with tech-preview stage.
        // TODO(major): remove this
        if (toc.stage === Stage.TECH_PREVIEW) {
            return item;
        }

        if (item.name) {
            item.items = (item.items || []).concat(toc.items || []);

            return item;
        } else {
            return toc.items;
        }
    });

    return toc;
}

function getFirstValuable<T>(
    items: TextFilter[] | string,
    vars: Hash,
    fallback?: T,
): T | undefined {
    if (typeof items === 'string') {
        items = [{text: items, when: true}];
    }

    if (!Array.isArray(items)) {
        items = [];
    }

    for (const item of items) {
        let {when = true} = item;
        delete item.when;

        if (typeof when === 'string') {
            when = evalExp(when, vars);
        }

        if (when) {
            return item.text as T;
        }
    }

    return fallback;
}

/**
 * Replaces include fields in toc file by resolved toc.
 * @param path
 * @param items
 * @param tocDir
 * @param sourcesDir
 * @param vars
 * @return
 * @private
 */
// async function _replaceIncludes(
//     path: string,
//     items: YfmToc[],
//     tocDir: string,
//     sourcesDir: string,
//     vars: Record<string, string>,
// ): Promise<YfmToc[]> {
//     const result: YfmToc[] = [];
//
//     for (const item of items) {
//         let includedInlineItems: YfmToc[] | null = null;
//
//         if (item.name) {
//             const tocPath = join(tocDir, 'toc.yaml');
//
//             item.name = _liquidSubstitutions(item.name, vars, tocPath);
//         }
//
//         try {
//             await applyIncluders(path, item, vars);
//         } catch (err) {
//             if (err instanceof Error || err instanceof IncludersError) {
//                 const message = err.toString();
//
//                 const file = err instanceof IncludersError ? err.path : path;
//
//                 logger.error(file, message);
//             }
//         }
//
//         if (item.include) {
//             const {mode = IncludeMode.ROOT_MERGE} = item.include;
//             const includeTocPath =
//                 mode === IncludeMode.ROOT_MERGE
//                     ? resolve(sourcesDir, item.include.path)
//                     : resolve(tocDir, item.include.path);
//             const includeTocDir = dirname(includeTocPath);
//
//             try {
//                 const includeToc = load(readFileSync(includeTocPath, 'utf8')) as YfmToc;
//
//                 /* Save the path to exclude toc from the output directory in the next step */
//                 addIncludeTocPath(includeTocPath);
//
//                 let includedTocItems = (item.items || []).concat(includeToc.items);
//
//                 /* Resolve nested toc inclusions */
//                 const baseTocDir = mode === IncludeMode.LINK ? includeTocDir : tocDir;
//                 includedTocItems = await processTocItems(
//                     path,
//                     includedTocItems,
//                     baseTocDir,
//                     sourcesDir,
//                     vars,
//                 );
//             } catch (err) {
//                 const message = `Error while including toc: ${bold(includeTocPath)} to ${bold(
//                     join(tocDir, 'toc.yaml'),
//                 )}`;
//
//                 log.error(message);
//
//                 continue;
//             } finally {
//                 delete item.include;
//             }
//         } else if (item.items) {
//             item.items = await processTocItems(path, item.items, tocDir, sourcesDir, vars);
//         }
//     }
//
//     return result;
// }
//
