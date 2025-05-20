import type {LiquidContext, SourceMap} from '@diplodoc/liquid';
import type {Meta} from '~/core/meta';
import type {Logger} from '~/core/logger';
import type {Bucket} from '~/core/utils';
import type {Collect, HeadingInfo, IncludeInfo, Location} from './types';

import {merge} from 'lodash';

import {bucket} from '~/core/utils';

import {mangleFrontMatter} from './loader/mangle-frontmatter';
import {templateContent} from './loader/template-content';
import {resolveComments} from './loader/resolve-comments';
import {resolveDependencies} from './loader/resolve-deps';
import {resolveAssets} from './loader/resolve-assets';
import {resolveHeadings} from './loader/resolve-headings';

export enum TransformMode {
    Html = 'html',
    Md = 'md',
}

export enum CollectStage {
    Before = 'before',
    after = 'after',
}

export class LoaderAPI {
    comments: Bucket<Location[]>;
    deps: Bucket<IncludeInfo[]>;
    assets: Bucket<NormalizedPath[]>;
    meta: Bucket<Meta>;
    headings: Bucket<HeadingInfo[]>;
    sourcemap: Bucket<Record<number | string, string>>;

    constructor(proxy: Partial<LoaderAPI> = {}) {
        this.deps = proxy.deps || bucket();
        this.assets = proxy.assets || bucket();
        this.meta = proxy.meta || bucket();
        this.comments = proxy.comments || bucket();
        this.headings = proxy.headings || bucket();
        this.sourcemap = proxy.sourcemap || bucket();
    }
}

export type LoaderContext = LiquidContext & {
    path: NormalizedPath;
    vars: Hash;
    sign: string;
    logger: Logger;
    emitFile(path: NormalizedPath, content: string): Promise<void>;
    readFile(path: NormalizedPath): Promise<string>;
    collects: Record<CollectStage, Collect[]>;
    api: LoaderAPI;
    sourcemap: SourceMap;
    options: {
        disableLiquid: boolean;
    };
};

export async function loader(this: LoaderContext, content: string) {
    content = mangleFrontMatter.call(this, content);
    content = templateContent.call(this, content);
    content = await applyCollectPlugins.call(this, content, 'before');
    content = resolveComments.call(this, content);
    content = resolveDependencies.call(this, content);
    content = resolveAssets.call(this, content);
    content = resolveHeadings.call(this, content);
    content = await applyCollectPlugins.call(this, content, 'after');

    this.api.sourcemap.set(this.sourcemap.dump());

    return content;
}

async function applyCollectPlugins(this: LoaderContext, content: string, stage: `${CollectStage}`) {
    let meta = {};

    for (const collect of this.collects[stage]) {
        let result = await collect.call(this, content, {});

        if (Array.isArray(result)) {
            meta = merge(meta, result[1] || {});
            result = result[0] as string;
        }

        if (result !== undefined) {
            content = result as string;
        }
    }

    return content;
}
