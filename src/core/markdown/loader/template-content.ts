import type {LoaderContext} from '../loader';

import {liquidSnippet} from '@diplodoc/liquid';

export function templateContent(this: LoaderContext, rawContent: string) {
    const {vars, options} = this;
    const {disableLiquid} = options;

    if (disableLiquid) {
        return rawContent;
    }

    const content = liquidSnippet.call(this, rawContent, vars, this.sourcemap);

    return content;
}
