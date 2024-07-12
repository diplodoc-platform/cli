import {MetaDataOptions, VarsMetadata} from '../../models';
import {mergeMetadata} from './mergeMetadata';
import {FileMetadata, parseExistingMetadata} from './parse';
import {emplaceMetadata} from './utils';
import {resolveVCSFrontMatter} from './vcsMetadata';

type FrontMatterVars = {
    metadataVars?: VarsMetadata;
    systemVars?: unknown;
};

type EnrichWithFrontMatterOptions = {
    fileContent: string;
    metadataOptions: MetaDataOptions;
    resolvedFrontMatterVars: FrontMatterVars;
};

const resolveVCSPath = (metadata: FileMetadata, relativeInputPath: string) => {
    const maybePreProcessedSourcePath = metadata.sourcePath;

    return typeof maybePreProcessedSourcePath === 'string' && maybePreProcessedSourcePath.length > 0
        ? maybePreProcessedSourcePath
        : relativeInputPath;
};

export const enrichWithFrontMatter = async ({
    fileContent,
    metadataOptions,
    resolvedFrontMatterVars,
}: EnrichWithFrontMatterOptions) => {
    const {systemVars, metadataVars} = resolvedFrontMatterVars;
    const {resources, addSystemMeta, shouldAlwaysAddVCSPath, pathData} = metadataOptions;
    const {metadata, metadataStrippedContent} = parseExistingMetadata(fileContent);

    const vcsFrontMatter = metadataOptions.isContributorsEnabled
        ? await resolveVCSFrontMatter(metadata, metadataOptions, fileContent)
        : undefined;

    const mergedMetadata = mergeMetadata({
        existingMetadata: metadata,
        resources,
        metadataVars,
        systemVars: addSystemMeta ? systemVars : undefined,
        additionalMetadata: {
            vcsPath: shouldAlwaysAddVCSPath
                ? resolveVCSPath(metadata, pathData.pathToFile)
                : undefined,
            ...vcsFrontMatter,
        },
    });

    return emplaceMetadata(metadataStrippedContent, mergedMetadata);
};
