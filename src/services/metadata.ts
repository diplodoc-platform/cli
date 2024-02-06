import {dump, load} from 'js-yaml';

import {VCSConnector} from '../vcs-connector/connector-models';
import {MetaDataOptions, Metadata, Resources, VarsMetadata} from '../models';
import {
    getAuthorDetails,
    updateAuthorMetadataStringByAuthorLogin,
    updateAuthorMetadataStringByFilePath,
} from './authors';
import {
    getFileContributorsMetadata,
    getFileContributorsString,
    getFileIncludes,
} from './contributors';
import {isObject} from './utils';
import {сarriage} from '../utils';
import {REGEXP_AUTHOR, metadataBorder} from '../constants';
import {dirname, relative, resolve} from 'path';
import {ArgvService, TocService} from './index';

async function getContentWithUpdatedMetadata(
    fileContent: string,
    options?: MetaDataOptions,
    systemVars?: unknown,
    metadataVars?: VarsMetadata,
): Promise<string> {
    let result;

    result = getContentWithUpdatedStaticMetadata({
        fileContent,
        sourcePath: options?.fileData?.sourcePath,
        addSystemMeta: options?.addSystemMeta,
        addSourcePath: options?.addSourcePath,
        resources: options?.resources,
        systemVars,
        metadataVars,
    });

    result = await getContentWithUpdatedDynamicMetadata(result, options);

    return result;
}

function getContentWithUpdatedStaticMetadata({
    fileContent,
    sourcePath,
    addSystemMeta,
    addSourcePath,
    resources,
    systemVars,
    metadataVars = [],
}: {
    fileContent: string;
    sourcePath?: string;
    addSystemMeta?: boolean;
    addSourcePath?: boolean;
    resources?: Resources;
    systemVars?: unknown;
    metadataVars?: VarsMetadata;
}): string {
    const newMetadatas: string[] = [];

    if (
        (!addSystemMeta || !systemVars) &&
        !addSourcePath &&
        !resources &&
        metadataVars.length === 0
    ) {
        return fileContent;
    }

    const matches = matchMetadata(fileContent);

    if (addSystemMeta && systemVars && isObject(systemVars)) {
        newMetadatas.push(getSystemVarsMetadataString(systemVars));
    }

    if (resources) {
        newMetadatas.push(dump(resources));
    }

    if (addSourcePath && sourcePath) {
        const sourcePathMetadataString = `sourcePath: ${sourcePath}`;
        newMetadatas.push(sourcePathMetadataString);
    }

    if (matches && matches.length > 0) {
        const [, fileMetadata, , fileMainContent] = matches;

        if (!metadataVars.length) {
            return `${getUpdatedMetadataString(newMetadatas, fileMetadata)}${fileMainContent}`;
        }

        const parsed = load(fileMetadata) as Record<string, any>;

        if (!Array.isArray(parsed.metadata)) {
            parsed.metadata = [parsed.metadata];
        }

        parsed.metadata = parsed.metadata
            .concat(metadataVars)
            .filter(Boolean);

        const patchedMetada = dump(parsed);

        return `${getUpdatedMetadataString(newMetadatas, patchedMetada)}${fileMainContent}`;
    }

    if (metadataVars.length) {
        newMetadatas.push(dump({metadata: metadataVars}));
    }

    return `${getUpdatedMetadataString(newMetadatas)}${fileContent}`;
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
            const {
                fileData: {tmpInputFilePath, inputFolderPathLength},
            } = options;
            const relativeFilePath = tmpInputFilePath.substring(inputFolderPathLength);
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
    const regexpFileContent = '-{3}((.*[\r?\n]*)*)';

    const regexpParseFileContent = new RegExp(`${regexpMetadata}${regexpFileContent}`, 'gm');

    return regexpParseFileContent.exec(fileContent);
}

async function getContributorsMetadataString(
    options: MetaDataOptions,
    fileContent: string,
): Promise<string | undefined> {
    const {isContributorsEnabled, vcsConnector, fileData} = options;

    if (isContributorsEnabled && vcsConnector) {
        const updatedFileData = {
            ...fileData,
            fileContent,
        };

        return getFileContributorsMetadata(updatedFileData, vcsConnector);
    }

    return undefined;
}

async function getModifiedTimeMetadataString(options: MetaDataOptions, fileContent: string) {
    const {isContributorsEnabled, vcsConnector, fileData} = options;

    const {tmpInputFilePath, inputFolderPathLength} = fileData;

    const relativeFilePath = tmpInputFilePath.substring(inputFolderPathLength + 1);

    if (!isContributorsEnabled || !vcsConnector) {
        return undefined;
    }

    const includedFiles = await getFileIncludes({...fileData, fileContent});
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
    const newMetadata = newMetadatas.join(сarriage) + (newMetadatas.length ? сarriage : '');
    const preparedDefaultMetadata = defaultMetadata.trimRight();
    const defaultMetadataСarriage = preparedDefaultMetadata ? сarriage : '';
    const updatedMetadata = `${preparedDefaultMetadata}${defaultMetadataСarriage}${newMetadata}`;

    return `${metadataBorder}${сarriage}${updatedMetadata}${metadataBorder}${
        defaultMetadata.length ? '' : сarriage
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
    const {isContributorsEnabled, vcsConnector, fileData} = options;

    if (isContributorsEnabled && vcsConnector) {
        const updatedFileData = {
            ...fileData,
            fileContent,
        };

        return getFileContributorsString(updatedFileData, vcsConnector);
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

function getSystemVarsMetadataString(systemVars: object) {
    return `__system: ${JSON.stringify(systemVars)}`;
}

function getAssetsPublicPath(filePath: string) {
    const {input} = ArgvService.getConfig();
    const path: string = resolve(input, filePath);

    /* Relative path from folder of .md file to root of user' output folder */
    return relative(dirname(path), resolve(input));
}

export {
    getContentWithUpdatedMetadata,
    getContentWithUpdatedStaticMetadata,
    getVCSMetadata,
    getAssetsPublicPath,
};
