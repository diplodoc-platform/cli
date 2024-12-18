import type {TocService} from './TocService';
import type {RawToc, RawTocItem, Toc, YfmString} from './types';

import {ok} from 'node:assert';
import {dirname, join, relative} from 'node:path';
import {omit} from 'lodash';
import evalExp from '@diplodoc/transform/lib/liquid/evaluation';
import {liquidSnippet} from '@diplodoc/transform/lib/liquid';

import {isExternalHref, normalizePath, own} from '~/utils';
import {getFirstValuable, isRelative} from './utils';

export type LoaderContext = {
    root: AbsolutePath;
    path: RelativePath;
    base: RelativePath;
    mergeBase?: RelativePath;
    mode: IncludeMode;
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

export default async function (this: LoaderContext, toc: RawToc): Promise<RawToc> {
    // Designed to be isolated loaders in future
    toc = await resolveFields.call(this, toc);
    toc = await resolveItems.call(this, toc);
    toc = await templateFields.call(this, toc);
    toc = await processItems.call(this, toc);
    toc = await rebaseItems.call(this, toc);
    toc = await normalizeItems.call(this, toc);

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

async function processItems(this: LoaderContext, toc: RawToc): Promise<RawToc> {
    toc.items = await this.toc.walkItems(toc.items, async (item) => {
        item = await this.toc.hooks.Item.promise(item, this.path);

        if (!item || !own(item, 'include')) {
            return item;
        }

        const {include} = item;

        ok(include.path, 'Invalid value for include path.');

        let toc: Toc | undefined = {};
        if (own(include, 'includers')) {
            ok(
                include.mode === IncludeMode.Link || !include.mode,
                'Invalid mode value for include with includers.',
            );
            ok(Array.isArray(include.includers), 'Includers should be an array.');

            const path = !include.path.endsWith('toc.yaml')
                ? join(include.path, 'toc.yaml')
                : include.path;
            const tocPath = join(dirname(this.path), path);

            toc = await this.toc.applyIncluders(toc, this.path, include.includers, tocPath);
        } else {
            const includeInfo = {
                from: this.path,
                path: join(dirname(this.path), include.path),
                mode: include.mode || IncludeMode.RootMerge,
                mergeBase: this.mergeBase,
            };

            if ([IncludeMode.RootMerge, IncludeMode.Merge].includes(includeInfo.mode)) {
                includeInfo.mergeBase = includeInfo.mergeBase || dirname(this.path);
                includeInfo.path = join(includeInfo.mergeBase, include.path);
            }

            toc = await this.toc.load(includeInfo.path, includeInfo);
        }

        item = omit(item, ['include']) as RawTocItem;

        if (!toc) {
            return null;
        }

        if (item.name) {
            item.items = (item.items || []).concat((toc.items as RawTocItem[]) || []);

            return item;
        } else {
            return toc.items as RawTocItem[];
        }
    });

    return toc;
}

async function rebaseItems(this: LoaderContext, toc: RawToc): Promise<RawToc> {
    if (this.mode !== IncludeMode.Link) {
        return toc;
    }

    const rebase = (item: RawTocItem | RawToc) => {
        if (own<AnyPath>(item, 'href') && isRelative(item.href)) {
            const absBase = join(this.root, dirname(this.base) as RelativePath);
            const absPath = join(this.root, this.mergeBase || dirname(this.path), item.href);

            item.href = relative(absBase, absPath);
        }

        return item;
    };

    await this.toc.walkItems([toc], rebase);

    return toc;
}

async function normalizeItems(this: LoaderContext, toc: RawToc): Promise<RawToc> {
    await this.toc.walkItems([toc], (item: RawTocItem | RawToc) => {
        // Looks like this logic is useless
        // because we override ids on client
        // (item as Partial<TocItem>).id = uuid();

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
