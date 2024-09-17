import {Resources, VarsMetadata} from '../../models';
import {isObject} from '../utils';
import {FileMetadata} from './parse';

export const mergeMetadata = ({
    existingMetadata,
    resources,
    systemVars,
    metadataVars = [],
    additionalMetadata,
}: {
    existingMetadata: FileMetadata;
    metadataVars?: VarsMetadata;
    resources?: Resources;
    systemVars?: unknown;
    additionalMetadata?: Record<string, unknown>;
}): FileMetadata => {
    const mergedInnerMetadata: FileMetadata['metadata'] = [
        ...(existingMetadata.metadata ?? []),
        ...metadataVars,
    ];

    // Technically, we could use the trick of creating a property, but setting it to `undefined`
    // That way js-yaml wouldn't include it in the serialized YAML
    // However, that way, this would overwrite (delete) existing properties, e.g.: sourcePath
    // Because of this, we spread objects to create properties if necessary
    const systemVarsMetadataToSpread = isObject(systemVars) ? {__system: systemVars} : undefined;
    const innerMetadataToSpread =
        mergedInnerMetadata.length > 0 ? {metadata: mergedInnerMetadata} : undefined;

    const mergedMetadata: FileMetadata = {
        ...existingMetadata,
        ...resources,
        ...systemVarsMetadataToSpread,
        ...additionalMetadata,
        ...innerMetadataToSpread,
    };

    return mergedMetadata;
};
