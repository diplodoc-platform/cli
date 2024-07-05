import {dump, load} from 'js-yaml';
import {VCSConnector} from '../vcs-connector/connector-models';
import {MetaDataOptions, Metadata, PathData, Resources, VarsMetadata, YfmToc} from '../models';
import {
    getAuthorDetails,
    updateAuthorMetadataStringByAuthorLogin,
    updateAuthorMetadataStringByFilePath,
} from './authors';
import {
    ContributorsServiceFileData,
    getFileContributorsMetadata,
    getFileContributorsString,
    getFileIncludes,
} from './contributors';
import {isObject} from './utils';
import {carriageReturn} from '../utils';
import {REGEXP_AUTHOR, metadataBorder} from '../constants';
import {TocService} from './index';

function resolveAdditionalMetadata({
    pathData,
    shouldAlwaysAddVCSPath,
}: MetaDataOptions): Record<string, unknown> {
    return {
        vcsPath: shouldAlwaysAddVCSPath ? pathData.pathToFile : undefined,
    };
}

async function getContentWithUpdatedMetadata(
    fileContent: string,
    options: MetaDataOptions,
    systemVars?: unknown,
    metadataVars?: VarsMetadata,
): Promise<string> {
    const {pathData, addSystemMeta, addSourcePath, resources} = options ?? {};

    const withUpdatedStaticMeta = getContentWithUpdatedStaticMetadata({
        fileContent,
        sourcePath: pathData?.pathToFile,
        addSystemMeta,
        addSourcePath,
        resources,
        systemVars,
        metadataVars,
        additionalMetadata: resolveAdditionalMetadata(options),
    });

    return await getContentWithUpdatedDynamicMetadata(withUpdatedStaticMeta, options);
}

type FileMetadata = {
    [key: string]: unknown;
    metadata?: Record<string, unknown>[];
};

type ParseExistingMetadataReturn = {
    metadata: FileMetadata;
    metadataStrippedContent: string;
};

function parseExistingMetadata(fileContent: string): ParseExistingMetadataReturn {
    const matches = matchMetadata(fileContent);

    if (matches && matches.length > 0) {
        const [, metadata, , metadataStrippedContent] = matches;

        return {
            metadata: load(metadata) as FileMetadata,
            metadataStrippedContent,
        };
    }

    return {
        metadata: {},
        metadataStrippedContent: fileContent,
    };
}

function serializeMetadata(objectMetadata: FileMetadata) {
    const dumped = dump(objectMetadata).trimEnd();

    // This empty object check is a bit naive
    // The other option would be to check if all own fields are `undefined`,
    // since we exploit passing in `undefined` to remove a field quite a bit
    if (dumped === '{}') {
        return '';
    }

    return `${metadataBorder}${carriageReturn}${dumped}${carriageReturn}${metadataBorder}${carriageReturn}`;
}

function getContentWithUpdatedStaticMetadata({
    fileContent,
    sourcePath,
    addSystemMeta,
    addSourcePath,
    resources,
    systemVars,
    additionalMetadata,
    metadataVars = [],
}: {
    fileContent: string;
    sourcePath?: string;
    addSystemMeta?: boolean;
    addSourcePath?: boolean;
    resources?: Resources;
    systemVars?: unknown;
    additionalMetadata?: Record<string, unknown>;
    metadataVars?: VarsMetadata;
}): string {
    const {metadata, metadataStrippedContent} = parseExistingMetadata(fileContent);

    const mergedInnerMetadata: FileMetadata['metadata'] = [
        ...(metadata.metadata ?? []),
        ...metadataVars,
    ];

    // Technically, we could use the trick of creating a property, but setting it to `undefined`
    // That way js-yaml wouldn't include it in the serialized YAML
    // However, that way, this would overwrite (delete) existing properties, e.g.: sourcePath
    // Because of this, we spread objects to create properties if necessary
    const systemVarsMetadataToSpread =
        addSystemMeta && isObject(systemVars) ? {__system: JSON.stringify(systemVars)} : undefined;
    const sourcePathMetadataToSpread = addSourcePath && sourcePath ? {sourcePath} : undefined;
    const innerMetadataToSpread =
        mergedInnerMetadata.length > 0 ? {metadata: mergedInnerMetadata} : undefined;

    const mergedMetadata: FileMetadata = {
        ...metadata,
        ...resources,
        ...additionalMetadata,
        ...systemVarsMetadataToSpread,
        ...sourcePathMetadataToSpread,
        ...innerMetadataToSpread,
    };

    return `${serializeMetadata(mergedMetadata)}${metadataStrippedContent}`;
}

async function getContentWithUpdatedDynamicMetadata(
    fileContent: string,
    options?: MetaDataOptions,
): Promise<string> {
    if (!options || !options?.isContributorsEnabled) {
        return fileContent;
    }

    let fileMetadata: string | undefined, fileMainContent: string | undefined;
    const matches = matchMetadata(fileContent);
    if (matches && matches.length > 0) {
        const [, matchedFileMetadata, , matchedFileMainContent] = matches;
        fileMetadata = matchedFileMetadata;
        fileMainContent = matchedFileMainContent;
    }

    const newMetadatas: string[] = [];

    const {isContributorsEnabled} = options;

    if (isContributorsEnabled) {
        const contributorsMetaData = await getContributorsMetadataString(options, fileContent);
        if (contributorsMetaData) {
            newMetadatas.push(contributorsMetaData);
        }

        const mtimeMetadata = await getModifiedTimeMetadataString(options, fileContent);
        if (mtimeMetadata) {
            newMetadatas.push(mtimeMetadata);
        }

        let authorMetadata = '';
        if (fileMetadata) {
            const matchAuthor = fileMetadata.match(REGEXP_AUTHOR);
            if (matchAuthor) {
                const matchedAuthor = matchAuthor[0];
                authorMetadata = await updateAuthorMetadataStringByAuthorLogin(
                    matchedAuthor,
                    options.vcsConnector,
                );
            }
        }

        if (!authorMetadata) {
            const {pathToFile: relativeFilePath} = options.pathData;
            authorMetadata = await updateAuthorMetadataStringByFilePath(
                relativeFilePath,
                options.vcsConnector,
            );
        }

        if (authorMetadata) {
            newMetadatas.push(`author: ${authorMetadata}`);
        }
    }

    if (fileMetadata && fileMainContent) {
        let updatedFileMetadata = fileMetadata;
        const matchAuthor = fileMetadata.match(REGEXP_AUTHOR);

        const isNewMetadataIncludesAuthor = newMetadatas.some((item) => /^author: /.test(item));
        if (matchAuthor && isNewMetadataIncludesAuthor) {
            updatedFileMetadata = updatedFileMetadata.replace(`author: ${matchAuthor[0]}`, '');
        }

        return `${getUpdatedMetadataString(newMetadatas, updatedFileMetadata)}${fileMainContent}`;
    }

    return `${getUpdatedMetadataString(newMetadatas)}${fileContent}`;
}

function matchMetadata(fileContent: string) {
    if (!fileContent.startsWith('---')) {
        return null;
    }

    // Search by format:
    // ---
    // metaName1: metaValue1
    // metaName2: meta value2
    // incorrectMetadata
    // ---
    const regexpMetadata = '(?<=-{3}\\r?\\n)((.*\\r?\\n)*?)(?=-{3}\\r?\\n)';
    // Search by format:
    // ---
    // main content 123
    const regexpFileContent = '-{3}\\r?\\n((.*[\r?\n]*)*)';

    const regexpParseFileContent = new RegExp(`${regexpMetadata}${regexpFileContent}`, 'gm');

    return regexpParseFileContent.exec(fileContent);
}

function getFileDataForContributorsService(
    pathData: PathData,
    fileContent: string,
): ContributorsServiceFileData {
    return {
        fileContent,
        resolvedFilePath: pathData.resolvedPathToFile,
        inputFolderPathLength: pathData.inputFolderPath.length,
    };
}

async function getContributorsMetadataString(
    options: MetaDataOptions,
    fileContent: string,
): Promise<string | undefined> {
    const {isContributorsEnabled, vcsConnector, pathData} = options;

    if (isContributorsEnabled && vcsConnector) {
        return getFileContributorsMetadata(
            getFileDataForContributorsService(pathData, fileContent),
            vcsConnector,
        );
    }

    return undefined;
}

async function getModifiedTimeMetadataString(options: MetaDataOptions, fileContent: string) {
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
        return `updatedAt: ${new Date(mtime * 1000).toISOString()}`;
    }

    return undefined;
}

function getUpdatedMetadataString(newMetadatas: string[], defaultMetadata = ''): string {
    const newMetadata =
        newMetadatas.join(carriageReturn) + (newMetadatas.length ? carriageReturn : '');
    const preparedDefaultMetadata = defaultMetadata.trimRight();
    const defaultMetadataСarriage = preparedDefaultMetadata ? carriageReturn : '';
    const updatedMetadata = `${preparedDefaultMetadata}${defaultMetadataСarriage}${newMetadata}`;

    return `${metadataBorder}${carriageReturn}${updatedMetadata}${metadataBorder}${
        defaultMetadata.length ? '' : carriageReturn
    }`;
}

async function getVCSMetadata(
    options: MetaDataOptions,
    fileContent: string,
    meta?: Metadata,
): Promise<Metadata> {
    const {vcsConnector} = options;

    const newMetadata: Metadata = {
        contributors: await getContributorsMetadata(options, fileContent),
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
}

async function getContributorsMetadata(
    options: MetaDataOptions,
    fileContent: string,
): Promise<string> {
    const {isContributorsEnabled, vcsConnector, pathData} = options;

    if (isContributorsEnabled && vcsConnector) {
        return getFileContributorsString(
            getFileDataForContributorsService(pathData, fileContent),
            vcsConnector,
        );
    }

    return JSON.stringify([]);
}

async function getAuthorMetadata(
    meta: Metadata,
    vcsConnector?: VCSConnector,
): Promise<string | null> {
    if (meta.author && vcsConnector) {
        const updatedAuthor = await getAuthorDetails(vcsConnector, meta.author);

        return updatedAuthor;
    }

    return null;
}

function getAssetsPublicPath(filePath: string) {
    const toc: YfmToc | null = TocService.getForPath(filePath) || null;

    const deepBase = toc?.root?.deepBase || toc?.deepBase || 0;
    const deepBasePath = deepBase > 0 ? Array(deepBase).fill('../').join('') : './';

    /* Relative path from folder of .md file to root of user' output folder */
    return deepBasePath;
}

function getAssetsRootPath(filePath: string) {
    const toc: YfmToc | null = TocService.getForPath(filePath) || null;

    return toc?.root?.base || toc?.base;
}

export {
    getContentWithUpdatedMetadata,
    getContentWithUpdatedStaticMetadata,
    getVCSMetadata,
    getAssetsPublicPath,
    getAssetsRootPath,
};
