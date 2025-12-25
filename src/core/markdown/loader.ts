import type {LiquidContext, SourceMap} from '@diplodoc/liquid';
import type {Meta} from '~/core/meta';
import type {Logger} from '~/core/logger';
import type {Bucket} from '~/core/utils';
import type {AssetInfo, Collect, HeadingInfo, IncludeInfo, Location} from './types';

import {merge} from 'lodash';

import {bucket} from '~/core/utils';

import {mangleFrontMatter} from './loader/mangle-frontmatter';
import {templateContent} from './loader/template-content';
import {resolveComments} from './loader/resolve-comments';
import {resolveDependencies} from './loader/resolve-deps';
import {resolveAssets} from './loader/resolve-assets';
import {resolveHeadings} from './loader/resolve-headings';
import {resolveNoTranslate} from './loader/resolve-no-translate';
import {resolveBlockCodes} from './loader/resolve-code';

export enum TransformMode {
    Html = 'html',
    Md = 'md',
}

export class LoaderAPI {
    blockCodes: Bucket<Location[]>;
    comments: Bucket<Location[]>;
    deps: Bucket<IncludeInfo[]>;
    assets: Bucket<AssetInfo[]>;
    meta: Bucket<Meta>;
    headings: Bucket<HeadingInfo[]>;
    sourcemap: Bucket<Record<number | string, string>>;

    constructor(proxy: Partial<LoaderAPI> = {}) {
        this.blockCodes = proxy.blockCodes || bucket();
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
    logger: Logger;
    emitFile(path: NormalizedPath, content: string): Promise<void>;
    readFile(path: NormalizedPath): Promise<string>;
    fullPath(path: RelativePath): AbsolutePath;
    collects: Collect[];
    api: LoaderAPI;
    sourcemap: SourceMap;
    options: {
        disableLiquid: boolean;
        mergeContentParts: boolean;
    };
    mode: 'build' | 'translate';
};

export async function loader(this: LoaderContext, content: string) {
    content = mangleFrontMatter.call(this, content);
    content = resolveNoTranslate.call(this, content);
    content = templateContent.call(this, content);
    content = await applyCollectPlugins.call(this, content);
    content = resolveBlockCodes.call(this, content);
    content = resolveComments.call(this, content);
    content = resolveDependencies.call(this, content);
    content = resolveAssets.call(this, content);
    content = resolveHeadings.call(this, content);

    this.api.sourcemap.set(this.sourcemap.dump());

    return content;
}

async function applyCollectPlugins(this: LoaderContext, content: string) {
    let meta = {};

    for (const collect of this.collects) {
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
