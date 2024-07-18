import {parseExistingMetadata} from './parse';
import {emplaceMetadata} from './utils';

export const addSourcePath = (fileContent: string, sourcePath: string) => {
    const {metadata, metadataStrippedContent} = parseExistingMetadata(fileContent, sourcePath);

    return emplaceMetadata(metadataStrippedContent, {
        ...metadata,
        sourcePath,
    });
};
