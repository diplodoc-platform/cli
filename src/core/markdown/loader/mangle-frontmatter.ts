import type {LoaderContext} from '../loader';

import {extractFrontMatter, liquidJson} from '@diplodoc/liquid';

function safeExtractFrontmatter(this: LoaderContext, content: string) {
    return extractFrontMatter(content, {json: true});
}

export function mangleFrontMatter(this: LoaderContext, rawContent: string) {
    const {vars, options} = this;
    const {disableLiquid} = options;

    const [frontmatter, content, rawFrontmatter] = safeExtractFrontmatter.call(this, rawContent);

    if (!frontmatter || !rawFrontmatter) {
        this.api.meta.set({});
        return rawContent;
    }

    if (disableLiquid) {
        this.api.meta.set(frontmatter);
    } else {
        this.api.meta.set(liquidJson.call(this, frontmatter, vars));
    }

    this.sourcemap.delete(1, rawFrontmatter);

    return content;
}
