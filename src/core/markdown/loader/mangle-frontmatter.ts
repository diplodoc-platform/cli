import type {LoaderContext} from '../loader';

import {extractFrontMatter, liquidJson} from '@diplodoc/liquid';

type YamlErrorMark = {
    line?: number;
};

type YamlError = {
    reason?: string;
    mark?: YamlErrorMark;
};

function safeExtractFrontmatter(this: LoaderContext, content: string) {
    try {
        return extractFrontMatter(content);
    } catch (error) {
        const err = error as YamlError;
        if (err.reason === 'duplicated mapping key') {
            const line = typeof err.mark?.line === 'number' ? err.mark.line + 1 : undefined;
            const key = line === undefined ? '' : content.split('\n')[line]?.trim().split(':')[0];

            if (key && key !== 'vcsPath') {
                const context = `[Reason: "${err.reason}"; Line: ${line}; Key: "${key}"]`;
                const errorMessage = `${this.path}: ${line}: YFM017 / invalid front matter format ${context}`;

                this.logger.error(errorMessage);
            }
        }
        return extractFrontMatter(content, {json: true});
    }
}

export function mangleFrontMatter(this: LoaderContext, rawContent: string) {
    const {vars, options} = this;
    const {disableLiquid} = options;

    const [frontmatter, content, rawFrontmatter] = safeExtractFrontmatter.call(this, rawContent);

    if (!rawFrontmatter) {
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
