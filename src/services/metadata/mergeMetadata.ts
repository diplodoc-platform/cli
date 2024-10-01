import {Resources, VarsMetadata} from '../../models';
import {isObject} from '../utils';
import {FrontMatter} from '@diplodoc/transform/lib/frontmatter/common';

export const mergeFrontMatter = ({
    existingMetadata,
    resources,
    systemVars,
    metadataVars = [],
    additionalMetadata,
}: {
    existingMetadata: FrontMatter;
    metadataVars?: VarsMetadata;
    resources?: Resources;
    systemVars?: unknown;
    additionalMetadata?: Record<string, unknown>;
}): FrontMatter => {
    const mergedInnerMetadata: FrontMatter['metadata'] = [
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

    const mergedMetadata: FrontMatter = {
        ...existingMetadata,
        ...resources,
        ...systemVarsMetadataToSpread,
        ...additionalMetadata,
        ...innerMetadataToSpread,
    };

    return mergedMetadata;
};
