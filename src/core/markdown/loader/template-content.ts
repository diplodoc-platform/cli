import type {LoaderContext} from '../loader';

import {liquidDocument, liquidSnippet} from '@diplodoc/liquid';

export function templateContent(this: LoaderContext, rawContent: string) {
    const {vars, options} = this;
    const {disableLiquid} = options;

    if (disableLiquid) {
        return rawContent;
    }

    let content;

    if (this.mode === 'translate') {
        content = liquidDocument.call(this, rawContent, vars);
    } else {
        content = liquidSnippet.call(this, rawContent, vars, this.sourcemap);
    }

    return content;
}
