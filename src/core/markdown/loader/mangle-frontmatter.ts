import type {LoaderContext} from '../loader';

import {extractFrontMatter, liquidJson} from '@diplodoc/liquid';

type YamlErrorMark = {
    line?: number;
};

type YamlError = {
    name?: string;
    reason?: string;
    mark?: YamlErrorMark;
};

function safeExtractFrontmatter(this: LoaderContext, content: string) {
    try {
        return extractFrontMatter(content);
    } catch (error) {
        const err = error as YamlError;
        if (err.reason === 'duplicated mapping key') {
            const err = error as YamlError;
            const path = this.path;

            const reason = err.reason || 'invalid front matter format';
            const line = typeof err.mark?.line === 'number' ? Number(err.mark.line) + 1 : undefined;

            const context =
                line === undefined
                    ? `[Reason: "${reason}"]`
                    : `[Reason: "${reason}"; Line: ${line}]`;

            const errorMessage =
                line === undefined
                    ? `${path}: ${err.name} / invalid front matter format ${context}`
                    : `${path}: ${line}: ${err.name} / invalid front matter format ${context}`;

            this.logger.error(errorMessage);
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
