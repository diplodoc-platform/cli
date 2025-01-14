import type {FrontMatter} from '@diplodoc/transform/lib/frontmatter';
import type {Run} from '~/commands/build';

import {MetaDataOptions, VarsMetadata} from '../../models';
import {mergeFrontMatter} from './mergeMetadata';
import {resolveVCSFrontMatter} from './vcsMetadata';
import {composeFrontMatter, extractFrontMatter} from '@diplodoc/transform/lib/frontmatter';

type FrontMatterVars = {
    metadataVars?: VarsMetadata;
    systemVars?: unknown;
    tocItemVars?: Record<string, string>;
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

export const enrichWithFrontMatter = async (
    run: Run,
    {fileContent, metadataOptions, resolvedFrontMatterVars}: EnrichWithFrontMatterOptions,
) => {
    const {systemVars, metadataVars, tocItemVars} = resolvedFrontMatterVars;
    const {resources, addSystemMeta, shouldAlwaysAddVCSPath, pathData} = metadataOptions;

    const [frontMatter, strippedContent] = extractFrontMatter(fileContent, pathData.pathToFile);

    const vcsFrontMatter = metadataOptions.isContributorsEnabled
        ? await resolveVCSFrontMatter(run, frontMatter, metadataOptions, fileContent)
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
            tocMetadata: tocItemVars,
        },
    });

    return composeFrontMatter(mergedFrontMatter, strippedContent);
};
