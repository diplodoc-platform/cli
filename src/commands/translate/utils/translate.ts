import type {ComposeOptions, ExtractOptions} from '@diplodoc/translation';
import type {TranslationLog} from './units';

import {compose as _compose, extract as _extract} from '@diplodoc/translation';

import {ComposeError, ExtractError} from './errors';

type Content = Parameters<typeof _extract>[0];

export function extract(content: Content, options: ExtractOptions, log?: TranslationLog) {
    try {
        const result = _extract(content, {
            ...options,
            ...(log && {
                log,
                deprecationWarnings: log.deprecationWarnings ?? options.deprecationWarnings,
            }),
        });
        const {xliff, units, skeleton, warnings = []} = result;
        // Optional until the paired translation-library release is installed.
        const {tableTitles = []} = result as typeof result & {tableTitles?: number[][]};

        return {xliff, units, skeleton, warnings, tableTitles};
    } catch (error: unknown) {
        throw new ExtractError(error as Error);
    }
}

type Skeleton = Parameters<typeof _compose>[0];
type Xliff = Parameters<typeof _compose>[1];

export function compose(skeleton: Skeleton, xliff: Xliff, options: ComposeOptions) {
    try {
        return _compose(skeleton, xliff, options);
    } catch (error: unknown) {
        throw new ComposeError(error as Error);
    }
}
