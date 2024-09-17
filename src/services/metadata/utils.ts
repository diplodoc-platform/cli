import {CARRIAGE_RETURN} from '~/constants';
import {FileMetadata, serializeMetadata} from './parse';

// IMO, we should just always apply this at the end of the whole processing pipeline,
// not when dumping meta/front matter
export const normalizeLineEndings = (input: string): string =>
    input.replace(/\r?\n/g, CARRIAGE_RETURN);

export const emplaceMetadata = (metadataStrippedContent: string, metadata: FileMetadata) =>
    normalizeLineEndings(`${serializeMetadata(metadata)}${metadataStrippedContent}`);
