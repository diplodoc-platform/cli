import type {TocService} from './TocService';
import type {IncludeInfo, RawToc, RawTocItem, TocInclude, YfmString} from './types';

import {ok} from 'node:assert';
import {dirname, join, relative} from 'node:path';
import {omit} from 'lodash';
import evalExp from '@diplodoc/transform/lib/liquid/evaluation';
import {liquidSnippet} from '@diplodoc/transform/lib/liquid';

import {isExternalHref, normalizePath, own} from '~/core/utils';

import {getHooks} from './hooks';
import {getFirstValuable, isRelative} from './utils';

export type LoaderContext = {
    /** Relative to run.input path to current processing toc */
    path: RelativePath;
    /** Path of last include level */
    from: RelativePath;
    /** Path of last include level with 'merge' mode */
    mergeBase?: RelativePath;
    mode: IncludeMode | undefined;
    vars: Hash;
    options: {
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

export function isLinkMode(mode: IncludeMode | undefined): mode is IncludeMode.Link {
    return IncludeMode.Link === mode;
}

export function isMergeMode(
    mode: IncludeMode | undefined,
): mode is IncludeMode.Merge | IncludeMode.RootMerge {
    return IncludeMode.RootMerge === mode || IncludeMode.Merge === mode;
}

// Designed to be isolated loaders in future
export async function loader(this: LoaderContext, toc: RawToc): Promise<RawToc> {
    // Resolves toc fields which can be filterable arrays.
    // Apply when filter in some toc fields
    toc = await resolveFields.call(this, toc);

    // Apply when filter in toc.items
    // Drop hidden items
    toc = await resolveItems.call(this, toc);

    // Interpolate liquid vars in some toc fields
    toc = await templateFields.call(this, toc);

    // Make include paths relative to project root instead of toc root
    toc = await rebaseIncludes.call(this, toc);

    // Resolve includes and includers in toc items
    toc = await processItems.call(this, toc);

    // Rebase items href path for deep includes
    toc = await rebaseItems.call(this, toc);

    // Fix item href extensions
    toc = await normalizeItems.call(this, toc);

    return toc;
}

/**
 * Resolves toc fields which can be filterable arrays.
 * Convert arrays to text fields (gets first truth value)
 */
async function resolveFields(this: LoaderContext, toc: RawToc): Promise<RawToc> {
    for (const field of ['title', 'label'] as const) {
        const value = toc[field];
        if (value) {
            toc[field] = getFirstValuable<YfmString>(value, this.vars);
        }
    }

    return toc;
}

/**
 * Applies liquid substitutions for some toc fields
 */
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

    for (const field of ['href', 'title', 'label', 'navigation'] as const) {
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

/**
 * Applies `when` filter in toc items.
 * Also drops hidden items if needed.
 */
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

/**
 * Processes items includes and includers.
 * Then merges result in original place in `named` or `inline` mode.
 */
async function processItems(this: LoaderContext, toc: RawToc): Promise<RawToc> {
    toc.items = await this.toc.walkItems(toc.items, async (item) => {
        item = await getHooks(this.toc).Item.promise(item, this.path);

        if (!item || !own(item, 'include')) {
            return item;
        }

        const {include} = item;

        ok(include.path, 'Invalid value for include path.');

        let toc: RawToc | undefined = {};
        if (own(include, 'includers')) {
            ok(
                include.mode === IncludeMode.Link || !include.mode,
                'Invalid mode value for include with includers.',
            );
            ok(Array.isArray(include.includers), 'Includers should be an array.');

            const path = include.path.endsWith('toc.yaml')
                ? include.path
                : join(include.path, 'toc.yaml');
            const tocPath = normalizePath(join(dirname(this.path), path));

            for (const includer of include.includers) {
                const hook = getHooks(this.toc).Includer.get(includer.name);

                ok(includer.name, 'Includer name should be a string.');
                ok(hook, `Includer with name '${includer.name}' is not registered.`);

                const options = {
                    ...includer,
                    path: tocPath,
                };

                toc = await hook.promise(toc, options, this.path);
            }

            toc = (await this.toc.load(tocPath, {
                from: this.path,
                mode: IncludeMode.Link,
                content: toc,
            })) as RawToc;
        } else {
            const includeInfo = {
                from: this.path,
                mode: include.mode || IncludeMode.RootMerge,
            } as IncludeInfo;

            if (isMergeMode(includeInfo.mode)) {
                includeInfo.mergeBase = this.mergeBase || dirname(this.path);
            }

            toc = (await this.toc.load(include.path, includeInfo)) as RawToc;
        }

        item = omit(item, ['include']) as RawTocItem;

        if (!toc) {
            return null;
        }

        // named mode
        if (item.name) {
            item.items = (item.items || []).concat((toc.items as RawTocItem[]) || []);

            return item;
        } else {
            return toc.items as RawTocItem[];
        }
    });

    return toc;
}

/**
 * Rebuses items includes path.
 * For link moda path should be always relative to original toc source.
 * For merge modes path should be relative to merge base, which can be inherited from parent->parent->toc.
 */
async function rebaseIncludes(this: LoaderContext, toc: RawToc): Promise<RawToc> {
    const rebaseIncludes = (item: RawTocItem | RawToc) => {
        if (own<TocInclude, 'include'>(item, 'include')) {
            if (isLinkMode(this.mode)) {
                item.include.path = join(dirname(this.path), item.include.path);
            } else {
                item.include.path = join(this.mergeBase || dirname(this.path), item.include.path);
            }
        }

        return item;
    };

    await this.toc.walkItems([toc], rebaseIncludes);

    return toc;
}

/**
 * Rebuses items href after include in parent toc
 */
async function rebaseItems(this: LoaderContext, toc: RawToc): Promise<RawToc> {
    const rebaseHrefs = (item: RawTocItem | RawToc) => {
        if (own<AnyPath>(item, 'href') && isRelative(item.href)) {
            const absBase = dirname(this.from);
            const absPath = join(this.mergeBase || dirname(this.path), item.href);

            item.href = relative(absBase, absPath);
        }

        return item;
    };

    if (isLinkMode(this.mode)) {
        await this.toc.walkItems([toc], rebaseHrefs);
    }

    return toc;
}

/**
 * Fixes item href extensions
 */
async function normalizeItems(this: LoaderContext, toc: RawToc): Promise<RawToc> {
    await this.toc.walkItems([toc], (item: RawTocItem | RawToc) => {
        if (own<string>(item, 'href') && !isExternalHref(item.href)) {
            item.href = normalizePath(item.href);

            if (item.href.endsWith('/')) {
                item.href = `${item.href}index.yaml`;
            }

            if (!item.href.endsWith('.md') && !item.href.endsWith('.yaml')) {
                item.href = `${item.href}.md`;
            }
        }

        return item;
    });

    return toc;
}
