import type {LoaderContext} from '../loader';

import {liquidSnippet} from '@diplodoc/liquid';
import liquid from '@diplodoc/transform/lib/liquid';

export function templateContent(this: LoaderContext, rawContent: string) {
    const {vars, options, path} = this;
    const {disableLiquid} = options;

    if (disableLiquid) {
        return rawContent;
    }

    let content;
    if (this.settings.useLegacyConditions) {
        content = liquid(rawContent, vars, path, {
            ...this.settings,
        });
    } else {
        content = liquidSnippet.call(this, rawContent, vars, this.sourcemap);
    }

    return content;
}
