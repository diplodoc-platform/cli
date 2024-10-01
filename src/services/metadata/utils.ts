import {carriageReturn} from '../../utils';

// IMO, we should just always apply this at the end of the whole processing pipeline,
// not when dumping meta/front matter
export const normalizeLineEndings = (input: string): string =>
    input.replace(/\r?\n/g, carriageReturn);
