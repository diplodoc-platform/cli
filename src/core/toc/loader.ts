import type {LiquidContext} from '@diplodoc/liquid';
import type {TocService} from './TocService';
import type {EntryTocItem, IncludeInfo, RawToc, RawTocItem, TocInclude, YfmString} from './types';

import {ok} from 'node:assert';
import {dirname, join, relative} from 'node:path';
import {omit} from 'lodash';
import {evaluate, liquidSnippet} from '@diplodoc/liquid';

import {normalizePath, own} from '~/core/utils';

import {getHooks} from './hooks';
import {getFirstValuable, isRelative} from './utils';

export type LoaderContext = LiquidContext & {
    /** Relative to run.input path to current processing toc */
    path: NormalizedPath;
    /** Path of last include level */
    from: NormalizedPath;
    /** Path of last include level with 'merge' mode */
    base?: NormalizedPath;
    mode: IncludeMode | undefined;
    vars: Hash;
    options: {
        removeHiddenItems: boolean;
    };
    toc: TocService;
    isTranslateMode?: boolean;
};

export enum IncludeMode {
    RootMerge = 'root_merge',
    Merge = 'merge',
    Link = 'link',
}

type MergeIncludeInfo = IncludeInfo & {
    mode: IncludeMode.RootMerge | IncludeMode.Merge;
    base: RelativePath;
};

type LinkIncludeInfo = IncludeInfo & {
    mode: IncludeMode.Link;
    base?: undefined;
};

export function isLinkMode(include: IncludeInfo | LoaderContext): include is LinkIncludeInfo {
    return IncludeMode.Link === include.mode;
}

export function isMergeMode(include: IncludeInfo | LoaderContext): include is MergeIncludeInfo {
    return IncludeMode.RootMerge === include.mode || IncludeMode.Merge === include.mode;
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
    const {conditions, substitutions} = this.settings;
    const interpolate = (box: Hash, field: string) => {
        const value = box[field];
        if (typeof value !== 'string') {
            return;
        }

        box[field] = liquidSnippet.call(this, value, this.vars);
    };

    if (!conditions && !substitutions) {
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
    const {removeHiddenItems} = this.options;
    const {conditions, substitutions} = this.settings;

    if (!conditions && !substitutions) {
        return toc;
    }

    toc.items = await this.toc.walkItems(toc.items, (item: RawTocItem) => {
        let when = true;

        if (conditions) {
            if (typeof item.when === 'string') {
                // only no quotes are possible vars
                const withoutQuotes = item.when.replace(/['"][^'"]*['"]/g, '');
                
                // get all possible vars
                const identifiers = withoutQuotes.match(/[\w-|]+[?]?/g) || [];
                
                // exclude literals and operators
                const variables = identifiers.filter(id => 
                    !['and', 'or', 'contains', 'true', 'false'].includes(id.toLowerCase()) &&
                    !/^\d+$/.test(id) // no numbers
                );
    
                // check if variable in vars config
                const hasAllVars = variables.every(varName => varName in this.vars);
    
                // if no vars then return item, but only for translate command
                if (!hasAllVars && this.isTranslateMode) {
                    delete item.when;
                    return item;
                }
    
                when = Boolean(evaluate(item.when, this.vars));
            } else {
                when = item.when !== false;
            }
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

            const tocPath = include.path.endsWith('toc.yaml')
                ? normalizePath(include.path)
                : normalizePath(join(include.path, 'toc.yaml'));

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

            toc = (await this.toc.include(tocPath, {
                from: this.path,
                mode: IncludeMode.Link,
                content: toc,
            })) as RawToc;
        } else {
            const includeInfo = {
                from: this.path,
                mode: include.mode,
            } as IncludeInfo;

            if (isMergeMode(includeInfo)) {
                includeInfo.base = this.base || this.path;
            }

            toc = (await this.toc.include(include.path, includeInfo)) as RawToc;
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
 * Rebases items includes path.
 * For link mode path should be always relative to original toc source.
 * For merge modes path should be relative to merge base, which can be inherited from parent->parent->toc.
 */
async function rebaseIncludes(this: LoaderContext, toc: RawToc): Promise<RawToc> {
    const rebaseIncludes = (item: RawTocItem | RawToc) => {
        if (!own<TocInclude, 'include'>(item, 'include')) {
            return item;
        }

        if (!item.include.mode) {
            item.include.mode = own<unknown, 'includers'>(item.include, 'includers')
                ? IncludeMode.Link
                : IncludeMode.RootMerge;
        }

        if (item.include.mode === IncludeMode.RootMerge) {
            return item;
        }

        if (isLinkMode(this)) {
            item.include.path = join(dirname(this.path), item.include.path);
        } else {
            item.include.path = join(dirname(this.base || this.path), item.include.path);
        }

        return item;
    };

    await this.toc.walkItems([toc], rebaseIncludes);

    return toc;
}

/**
 * Rebase items href after include in parent toc
 */
async function rebaseItems(this: LoaderContext, toc: RawToc): Promise<RawToc> {
    const rebaseHrefs = (item: RawTocItem | RawToc) => {
        if (own<AnyPath>(item, 'href') && isRelative(item.href)) {
            const absBase = dirname(this.from);
            const absPath = join(dirname(this.base || this.path), item.href);

            item.href = relative(absBase, absPath);
        }

        return item;
    };

    if (isLinkMode(this)) {
        await this.toc.walkItems([toc], rebaseHrefs);
    }

    return toc;
}

/**
 * Fixes item href extensions
 */
async function normalizeItems(this: LoaderContext, toc: RawToc): Promise<RawToc> {
    await this.toc.walkEntries([toc as unknown as EntryTocItem], (item) => {
        if (!item.href) {
            // @ts-ignore
            delete item['href'];
            return item;
        }

        let href: string = normalizePath(item.href);

        if (href.endsWith('/')) {
            href += 'index.yaml';
        }

        if (!href.endsWith('.md') && !href.endsWith('.yaml')) {
            href += '.md';
        }

        item.href = href as YfmString & NormalizedPath;

        return item;
    });

    return toc;
}
