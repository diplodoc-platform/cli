import {carriageReturn} from '../../utils';
import {FileMetadata, serializeMetadata} from './parse';

// IMO, we should just always apply this at the end of the whole processing pipeline,
// not when dumping meta/front matter
const normalizeLineEndings = (input: string): string => input.replace(/\r?\n/g, carriageReturn);

export const emplaceMetadata = (metadataStrippedContent: string, metadata: FileMetadata) =>
    normalizeLineEndings(`${serializeMetadata(metadata)}${metadataStrippedContent}`);
