import type {ConfigData, PreloadParams} from '@diplodoc/client/ssr';
import type {LeadingPage} from '~/core/leading';

import {preprocess} from '@diplodoc/client/ssr';

/** Selects precisely the Page Constructor fields rendered as Markdown. */
export function getLeadingMarkdown(leading: LeadingPage, options: PreloadParams) {
    const strings = new Set<string>();
    preprocess(leading as ConfigData, options, (_lang: string, value: string) => {
        strings.add(value);
        return value;
    });
    return [...strings];
}
