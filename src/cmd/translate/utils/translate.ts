import type {ComposeOptions, ExtractOptions} from '@diplodoc/translation';
import {compose as _compose, extract as _extract} from '@diplodoc/translation';

class ExtractError extends Error {
    code: string;

    constructor(error: Error) {
        super(error?.message || String(error));
        this.code = 'EXTRACT_ERROR';
    }
}

class ComposeError extends Error {
    code: string;

    constructor(error: Error) {
        super(error?.message || String(error));
        this.code = 'COMPOSE_ERROR';
    }
}

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
