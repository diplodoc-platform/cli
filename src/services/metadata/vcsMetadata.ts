import type {FrontMatter} from '@diplodoc/transform/lib/frontmatter';
import type {Run} from '~/commands/build';

import {join, relative} from 'node:path';
import {Contributor, MetaDataOptions, Metadata, PathData} from '../../models';
import {VCSConnector} from '../../vcs-connector/connector-models';
import {
    getAuthorDetails,
    updateAuthorMetadataStringByAuthorLogin,
    updateAuthorMetadataStringByFilePath,
} from '../authors';
import {ContributorsServiceFileData, getFileContributors, getFileIncludes} from '../contributors';
import {isObject} from '../utils';
import {normalizePath} from '../../utils';

const getFileDataForContributorsService = (
    pathData: PathData,
    fileContent: string,
): ContributorsServiceFileData => {
    return {
        fileContent,
        resolvedFilePath: pathData.resolvedPathToFile,
        inputFolderPathLength: pathData.inputFolderPath.length,
    };
};

const getModifiedTimeISOString = async (
    run: Run,
    options: MetaDataOptions,
    fileContent: string,
) => {
    const {isContributorsEnabled, vcsConnector, pathData} = options;

    const {pathToFile: relativeFilePath} = pathData;

    if (!isContributorsEnabled || !vcsConnector) {
        return undefined;
    }

    const includedFiles = [relativeFilePath]
        .concat(await getFileIncludes(getFileDataForContributorsService(pathData, fileContent)))
        .map((path) => join(run.input, path));

    const mappedIncludedFiles = await Promise.all(
        includedFiles.map((path) => run.realpath(path, false)),
    );
    const mtimeList = mappedIncludedFiles
        .map((path) => normalizePath(relative(run.input, path)))
        .map((path) => vcsConnector.getModifiedTimeByPath(path))
        .filter((v) => typeof v === 'number') as number[];

    if (mtimeList.length) {
        const mtime = Math.max(...mtimeList);
        return new Date(mtime * 1000).toISOString();
    }

    return undefined;
};

const getAuthorMetadata = async (
    meta: Metadata,
    vcsConnector?: VCSConnector,
): Promise<Contributor | null> => {
    if (meta.author && vcsConnector) {
        const updatedAuthor = await getAuthorDetails(vcsConnector, meta.author);

        return updatedAuthor;
    }

    return null;
};

const getContributorsMetadata = (options: MetaDataOptions, fileContent: string) => {
    const {isContributorsEnabled, vcsConnector, pathData} = options;

    if (isContributorsEnabled && vcsConnector) {
        return getFileContributors(
            getFileDataForContributorsService(pathData, fileContent),
            vcsConnector,
        );
    }

    return Promise.resolve([]);
};

export const getVCSMetadata = async (
    options: MetaDataOptions,
    fileContent: string,
    meta?: Metadata,
): Promise<Metadata> => {
    const {vcsConnector} = options;

    const newMetadata: Metadata = {
        contributors: (await getContributorsMetadata(options, fileContent)) ?? [],
    };

    if (!meta) {
        return newMetadata;
    }

    const updatedAuthor = await getAuthorMetadata(meta as Metadata, vcsConnector);

    return {
        ...meta,
        ...newMetadata,
        author: updatedAuthor,
    };
};

export const resolveVCSFrontMatter = async (
    run: Run,
    existingMetadata: FrontMatter,
    options: MetaDataOptions,
    fileContent: string,
) => {
    const getAuthor = () => {
        const {pathData, vcsConnector} = options;
        const maybeAuthorFromExistingMeta = existingMetadata.author;

        return typeof maybeAuthorFromExistingMeta === 'string' ||
            isObject(maybeAuthorFromExistingMeta)
            ? updateAuthorMetadataStringByAuthorLogin(maybeAuthorFromExistingMeta, vcsConnector)
            : updateAuthorMetadataStringByFilePath(pathData.pathToFile, vcsConnector);
    };

    const [author, contributors, updatedAt] = await Promise.all([
        getAuthor(),
        getContributorsMetadata(options, fileContent),
        getModifiedTimeISOString(run, options, fileContent),
    ]);

    const authorToSpread = author === null ? undefined : {author};
    const contributorsToSpread = contributors.length > 0 ? {contributors} : undefined;
    const updatedAtToSpread = updatedAt ? {updatedAt} : undefined;

    return {
        ...authorToSpread,
        ...contributorsToSpread,
        ...updatedAtToSpread,
    };
};
