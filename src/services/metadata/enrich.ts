import type {FrontMatter} from '@diplodoc/transform/lib/frontmatter';

import {MetaDataOptions, VarsMetadata} from '../../models';
import {mergeFrontMatter} from './mergeMetadata';
import {resolveVCSFrontMatter} from './vcsMetadata';
import {composeFrontMatter, extractFrontMatter} from '@diplodoc/transform/lib/frontmatter';

type FrontMatterVars = {
    metadataVars?: VarsMetadata;
    systemVars?: unknown;
};

type EnrichWithFrontMatterOptions = {
    fileContent: string;
    metadataOptions: MetaDataOptions;
    resolvedFrontMatterVars: FrontMatterVars;
};

const resolveVCSPath = (frontMatter: FrontMatter, relativeInputPath: string) => {
    const maybePreProcessedSourcePath = frontMatter.sourcePath;

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

    const [frontMatter, strippedContent] = extractFrontMatter(fileContent, pathData.pathToFile);

    const vcsFrontMatter = metadataOptions.isContributorsEnabled
        ? await resolveVCSFrontMatter(frontMatter, metadataOptions, fileContent)
        : undefined;

    const mergedFrontMatter = mergeFrontMatter({
        existingMetadata: frontMatter,
        resources,
        metadataVars,
        systemVars: addSystemMeta ? systemVars : undefined,
        additionalMetadata: {
            vcsPath:
                frontMatter.vcsPath ??
                (shouldAlwaysAddVCSPath
                    ? resolveVCSPath(frontMatter, pathData.pathToFile)
                    : undefined),
            ...vcsFrontMatter,
        },
    });

    return composeFrontMatter(mergedFrontMatter, strippedContent);
};
