import type {LiquidContext} from '@diplodoc/liquid';
import type {Meta} from '~/core/meta';
import type {AssetInfo, Filter, LeadingPage, Plugin, RawLeadingPage, TextItem} from './types';

import {get, set, uniq} from 'lodash';
import {evaluate, liquidJson, liquidSnippet} from '@diplodoc/liquid';
import {isMediaLink, parseLocalUrl, rebasePath} from '~/core/utils';

import {walkLinks} from './utils';

export type LoaderContext = LiquidContext & {
    /** Relative to run.input path to current processing toc */
    path: NormalizedPath;
    lang: string;
    vars: Hash;
    plugins: Plugin[];
    emitFile(path: NormalizedPath, content: string): Promise<void>;
    readFile(path: NormalizedPath): Promise<string>;
    leading: {
        setDependencies(path: NormalizedPath, deps: never[]): void;
        setAssets(path: NormalizedPath, assets: AssetInfo[]): void;
        setMeta(path: NormalizedPath, meta: Meta): void;
    };
    options: {
        disableLiquid: boolean;
    };
};

export async function loader(this: LoaderContext, yaml: RawLeadingPage) {
    yaml = resolveFields.call(this, yaml);
    yaml = mangleFrontMatter.call(this, yaml);
    yaml = templateFields.call(this, yaml);

    for (const plugin of this.plugins) {
        yaml = (await plugin.call(this, yaml as LeadingPage)) as RawLeadingPage;
    }

    yaml = resolveAssets.call(this, yaml);

    this.leading.setDependencies(this.path, []);

    return yaml as LeadingPage;
}

function resolveFields(this: LoaderContext, yaml: RawLeadingPage) {
    for (const field of ['title', 'nav.title', 'meta.title', 'meta.description'] as const) {
        const value = get(yaml, field);
        if (value) {
            set(yaml, field, toText(getFirstValuable(value, this.vars)));
        }
    }

    if (yaml.description) {
        yaml.description = toTextArray(getAllValuable(yaml.description, this.vars));
    }

    yaml.links = getAllValuable(yaml.links || [], this.vars);

    return yaml;
}

function mangleFrontMatter(this: LoaderContext, yaml: RawLeadingPage) {
    const {path, vars, options} = this;
    const {disableLiquid} = options;

    if (!yaml.meta) {
        this.leading.setMeta(path, {});
        return yaml;
    }

    const frontmatter = yaml.meta;
    yaml.meta = undefined;

    if (disableLiquid) {
        this.leading.setMeta(path, frontmatter);
    } else {
        this.leading.setMeta(path, liquidJson.call(this, frontmatter, vars));
    }

    return yaml;
}

function templateFields(this: LoaderContext, yaml: RawLeadingPage) {
    const {conditions, substitutions} = this.settings;
    const interpolate = (value: unknown) => {
        if (typeof value !== 'string') {
            return value;
        }

        return liquidSnippet.call(this, value, this.vars);
    };

    if (!conditions && !substitutions) {
        return yaml;
    }

    for (const field of ['title', 'description', 'nav.title'] as const) {
        const value = get(yaml, field);

        if (Array.isArray(value)) {
            set(yaml, field, value.map(interpolate));
        } else if (typeof value === 'string') {
            set(yaml, field, interpolate(value));
        }
    }

    for (const link of yaml.links) {
        for (const field of ['title', 'description'] as const) {
            const value = get(link, field);
            if (typeof value === 'string') {
                set(link, field, interpolate(value));
            }
        }
    }

    return yaml;
}

function resolveAssets(this: LoaderContext, yaml: RawLeadingPage) {
    const assets: AssetInfo[] = [];

    yaml = walkLinks(yaml, (link) => {
        const asset = parseLocalUrl(link);
        if (asset && isMediaLink(asset.path)) {
            asset.path = rebasePath(this.path, decodeURIComponent(asset.path) as RelativePath);
            assets.push(asset);
        }

        return link;
    });

    this.leading.setAssets(this.path, uniq(assets));

    return yaml;
}

function getAllValuable<T extends Filter | string>(items: T[] | T, vars: Hash): T[] {
    const result: T[] = [];

    for (const item of normalizeItems(items, vars)) {
        if (typeof item === 'string') {
            result.push(item);
        } else if (item.when !== false) {
            delete item.when;
            result.push(item);
        }
    }

    return result;
}

/**
 * Find first filterable item which 'when' field is truth like.
 */
export function getFirstValuable<T extends Filter | string>(
    items: T[] | T,
    vars: Hash,
): T | undefined {
    // This code looks like equiv to getAllValuable
    // At first glance we can write something like
    //
    // return getAllValuable(items, vars)[0] || '';
    //
    // But there is important to stop 'when' evaluation as fasts as possible.
    for (const item of normalizeItems(items, vars)) {
        if (typeof item === 'string') {
            return item;
        } else if (item.when !== false) {
            delete item.when;
            return item;
        }
    }

    return undefined;
}

function normalizeItems<T extends Filter | string>(items: T[] | T, vars: Hash) {
    if (!Array.isArray(items)) {
        items = [items];
    }

    return items.map((item) => {
        if (typeof item === 'string') {
            return item;
        }

        if (typeof item.when === 'string') {
            item.when = Boolean(evaluate(item.when, vars));
        }

        return item;
    });
}

function toText(item: TextItem | string | undefined): string | undefined {
    if (!item) {
        return undefined;
    }

    if (typeof item === 'string') {
        return item;
    }

    if (Array.isArray(item.text)) {
        return item.text[0];
    } else {
        return item.text;
    }
}

function toTextArray(items: (TextItem | string)[]): string[] {
    const result: string[] = [];

    for (const item of items) {
        if (typeof item === 'string') {
            result.push(item);
        } else if (typeof item.text === 'string') {
            result.push(item.text);
        } else {
            result.push(...item.text);
        }
    }

    return result;
}
