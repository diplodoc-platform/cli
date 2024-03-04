import type {ComposeOptions, ExtractOptions} from '@diplodoc/translation';
import {compose as _compose, extract as _extract} from '@diplodoc/translation';
import {ComposeError, ExtractError} from './errors';

type Content = Parameters<typeof _extract>[0];

export function extract(content: Content, options: ExtractOptions) {
    try {
        const {units, skeleton} = _extract(content, options);

        return {units, skeleton};
    } catch (error: any) {
        throw new ExtractError(error);
    }
}

type Skeleton = Parameters<typeof _compose>[0];
type Xliff = Parameters<typeof _compose>[1];

export function compose(skeleton: Skeleton, xliff: Xliff, options: ComposeOptions) {
    try {
        return _compose(skeleton, xliff, options);
    } catch (error: any) {
        throw new ComposeError(error);
    }
}
