import type {LiquidContext} from '@diplodoc/liquid';
import type {TocService} from './TocService';
import type {
    EntryTocItem,
    IncludeInfo,
    Navigation,
    NavigationHeaderItem,
    RawToc,
    RawTocItem,
    Toc,
    TocInclude,
    YfmString,
} from './types';

import {ok} from 'node:assert';
import {dirname, join, relative} from 'node:path';
import {omit} from 'lodash';
import {liquidSnippet} from '@diplodoc/liquid';

import {evaluateWhen, normalizePath, own} from '~/core/utils';

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
    include: (path: RelativePath, include: IncludeInfo) => Promise<Toc | undefined>;
    options: {
        removeHiddenItems: boolean;
        removeEmptyItems: boolean;
        skipMissingVars?: boolean;
        mode: string;
    };
    toc: TocService;
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

    // Apply when filter in navigation header items
    toc = await resolveNavigation.call(this, toc);

    // validate toc to [object Object] in fields
    toc = await validateToc.call(this, toc);

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

    // Remove empty items (no children and no href) if needed
    toc = await removeEmptyItems.call(this, toc);

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
 * Filters navigation header items (leftItems and rightItems) by `when` condition.
 */
async function resolveNavigation(this: LoaderContext, toc: RawToc): Promise<RawToc> {
    const {skipMissingVars} = this.options;
    const {conditions} = this.settings;

    if (!conditions || !toc.navigation || typeof toc.navigation !== 'object') {
        return toc;
    }

    const navigation = toc.navigation as Navigation;

    if (!navigation.header) {
        return toc;
    }

    const filterItems = (items: NavigationHeaderItem[] | undefined): NavigationHeaderItem[] => {
        if (!items || !Array.isArray(items)) {
            return [];
        }

        return items.filter((item) => {
            if (typeof item.when === 'string') {
                const result = evaluateWhen(item.when, this.vars, skipMissingVars);
                delete item.when;
                return result;
            }

            if (item.when === false) {
                delete item.when;
                return false;
            }

            delete item.when;
            return true;
        });
    };

    if (navigation.header.leftItems) {
        navigation.header.leftItems = filterItems(navigation.header.leftItems);
    }

    if (navigation.header.rightItems) {
        navigation.header.rightItems = filterItems(navigation.header.rightItems);
    }

    return toc;
}

/**
 * Checks table of contents items for invalid object values.
 * Recursively checks nested items.
 */
function checkTocItems(items: RawTocItem[], path = 'items'): string[] {
    const errors: string[] = [];
    const CHECK_FIELDS = ['name', 'href', 'title', 'label', 'navigation'] as const;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const currentPath = `${path}[${i}]`;

        if (item && typeof item === 'object' && !Array.isArray(item)) {
            for (const field of CHECK_FIELDS) {
                if (
                    item[field as keyof RawTocItem] !== undefined &&
                    item[field as keyof RawTocItem]?.toString() === '[object Object]'
                ) {
                    errors.push(`${currentPath}.${field}`);
                }
            }

            if (item.items && Array.isArray(item.items)) {
                const nestedErrors = checkTocItems(item.items, `${currentPath}.items`);
                errors.push(...nestedErrors);
            }
        }
    }
    return errors;
}

async function validateToc(this: LoaderContext, toc: RawToc): Promise<RawToc> {
    if (toc.items && Array.isArray(toc.items)) {
        const errors = checkTocItems(toc.items);
        const path = this.from ? this.from + ' -> ' + this.path : this.path;
        for (const error of errors) {
            this.logger.error(
                `Invalid toc structure in ${path.toString()} at ${error}: found [object Object] value`,
            );
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
    const {removeHiddenItems, skipMissingVars} = this.options;
    const {conditions, substitutions} = this.settings;

    if (!conditions && !substitutions) {
        return toc;
    }

    toc.items = await this.toc.walkItems(toc.items, (item: RawTocItem) => {
        let when = true;

        if (conditions) {
            if (typeof item.when === 'string') {
                when = evaluateWhen(item.when, this.vars, skipMissingVars);
            } else {
                // when: null/undefined/false are handled here
                when = item.when !== false;
            }

            delete item.when;
        }

        if (removeHiddenItems) {
            when = when && !item.hidden;
            delete item.hidden;
        }

        if (when) {
            return item;
        }

        if ('href' in item && item['href'] === null) {
            this.logger.warn(
                `Empty href property in item with name: ${item.name} in toc: ${this.path}`,
            );
        }

        return undefined;
    });

    return toc;
}

/**
 * Processes items includes and includers.
 * Then merges result in original place in `named` or `inline` mode.
 */
async function processItems(this: LoaderContext, toc: RawToc): Promise<RawToc> {
    const rawToc = toc;
    const isTranslateMode = this.options.mode === 'translate';

    toc.items = await this.toc.walkItems(toc.items, async (item) => {
        item = await getHooks(this.toc).Item.promise(item, this.path);

        if (
            !item ||
            !own(item, 'include') ||
            (isTranslateMode && item.include.path === 'openapi')
        ) {
            return item;
        }

        const {include} = item;

        ok(include.path, 'Invalid value for include path.');

        let toc: RawToc;
        if (own(include, 'includers')) {
            ok(
                include.mode === IncludeMode.Link || !include.mode,
                'Invalid mode value for include with includers.',
            );
            ok(Array.isArray(include.includers), 'Includers should be an array.');

            const tocPath = include.path.endsWith('toc.yaml')
                ? normalizePath(include.path)
                : normalizePath(join(include.path, 'toc.yaml'));

            toc = {path: tocPath};

            for (const includer of include.includers) {
                const hook = getHooks(this.toc).Includer.get(includer.name);

                ok(includer.name, 'Includer name should be a string.');
                ok(hook, `Includer with name '${includer.name}' is not registered.`);

                const options = {
                    ...includer,
                    path: tocPath,
                    rawToc,
                    include,
                };

                toc = await hook.promise(toc, options, this.path);
            }

            toc = (await this.include(tocPath, {
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

            toc = (await this.include(include.path, includeInfo)) as RawToc;
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
        if (own<AnyPath, 'href'>(item, 'href') && isRelative(item.href)) {
            const absBase = dirname(this.from);
            const absPath = join(dirname(this.base || this.path), item.href);

            item.href = relative(absBase, absPath) as YfmString & RelativePath;
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

/**
 * Removes empty items (no children and no href) if needed.
 */
async function removeEmptyItems(this: LoaderContext, toc: RawToc): Promise<RawToc> {
    const {removeEmptyItems} = this.options;

    if (!removeEmptyItems) {
        return toc;
    }

    const removeEmpty = (item: RawTocItem) => {
        // An item is empty if it has no children (no items property or empty items array) AND no href
        const hasChildren = item.items && item.items.length > 0;

        if (!hasChildren && !own(item, 'href')) {
            return null;
        }
        return item;
    };

    toc.items = await this.toc.walkItems(toc.items, removeEmpty);

    return toc;
}
