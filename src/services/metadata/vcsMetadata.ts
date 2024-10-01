import {TocService} from '..';
import {Contributor, MetaDataOptions, Metadata, PathData} from '../../models';
import {VCSConnector} from '../../vcs-connector/connector-models';
import {
    getAuthorDetails,
    updateAuthorMetadataStringByAuthorLogin,
    updateAuthorMetadataStringByFilePath,
} from '../authors';
import {ContributorsServiceFileData, getFileContributors, getFileIncludes} from '../contributors';
import {isObject} from '../utils';
import {FrontMatter} from '@diplodoc/transform/lib/frontmatter/common';

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

const getModifiedTimeISOString = async (options: MetaDataOptions, fileContent: string) => {
    const {isContributorsEnabled, vcsConnector, pathData} = options;

    const {pathToFile: relativeFilePath} = pathData;

    if (!isContributorsEnabled || !vcsConnector) {
        return undefined;
    }

    const includedFiles = await getFileIncludes(
        getFileDataForContributorsService(pathData, fileContent),
    );
    includedFiles.push(relativeFilePath);

    const tocCopyFileMap = TocService.getCopyFileMap();

    const mtimeList = includedFiles
        .map((path) => {
            const mappedPath = tocCopyFileMap.get(path) || path;
            return vcsConnector.getModifiedTimeByPath(mappedPath);
        })
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
        getModifiedTimeISOString(options, fileContent),
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
