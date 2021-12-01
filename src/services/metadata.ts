import {safeLoadFront} from 'yaml-front-matter';
import {dump} from 'js-yaml';

import {VCSConnector} from '../vcs-connector/connector-models';
import {Metadata, MetaDataOptions} from '../models';
import {getAuthorDetails, updateAuthorMetadataString} from './authors';
import {getFileContributorsMetadata, getFileContributorsString} from './contributors';
import {isObject} from './utils';

async function getContentWithUpdatedMetadata(
    fileContent: string,
    options?: MetaDataOptions,
    systemVars?: unknown,
): Promise<string> {
    let result;

    result = getContentWithUpdatedStaticMetadata(fileContent, options, systemVars);
    result = await getContentWithUpdatedDynamicMetadata(result, options);

    return result;
}

function getContentWithUpdatedStaticMetadata(
    fileContent: string,
    options?: MetaDataOptions,
    systemVars?: unknown,
): string {
    if (!options || (!options?.addSystemMeta || !systemVars) && !options?.addSourcePath) {
        return fileContent;
    }

    const matches = matchMetadata(fileContent);
    const newMetadatas: string[] = [];

    const {addSystemMeta, addSourcePath, fileData} = options;

    if (addSystemMeta && systemVars && isObject(systemVars)) {
        newMetadatas.push(getSystemVarsMetadataString(systemVars));
    }

    if (addSourcePath && fileData.sourcePath) {
        const sourcePathMetadataString = `sourcePath: ${fileData.sourcePath}`;
        newMetadatas.push(sourcePathMetadataString);
    }

    const {fileMetadata, fileMainContent} = matches;

    return `${getUpdatedMetadataString(newMetadatas, fileMetadata)}${fileMainContent}`;
}

async function getContentWithUpdatedDynamicMetadata(
    fileContent: string,
    options?: MetaDataOptions,
): Promise<string> {
    if (!options || !options?.isContributorsEnabled) {
        return fileContent;
    }

    const matches = matchMetadata(fileContent);
    const newMetadatas: string[] = [];

    const {isContributorsEnabled} = options;

    if (isContributorsEnabled) {
        newMetadatas.push(await getContributorsMetadataString(options, fileContent));
    }

    const {fileMetadata, fileMainContent} = matches;

    const updatedDefaultMetadata = await updateAuthorMetadataString(fileMetadata, options.vcsConnector);

    return `${getUpdatedMetadataString(newMetadatas, updatedDefaultMetadata)}${fileMainContent}`;
}

function matchMetadata(fileContent: string) {
    const {__content: fileMainContent, ...metadata} = safeLoadFront(fileContent);
    const fileMetadata = Object.keys(metadata).length ? dump(metadata) : '';

    return {
        fileMainContent,
        fileMetadata,
    };
}

async function getContributorsMetadataString(options: MetaDataOptions, fileContent: string): Promise<string> {
    const {isContributorsEnabled, vcsConnector, fileData} = options;
    let contributorsMetaData = '';

    if (isContributorsEnabled && vcsConnector) {
        const updatedFileData = {
            ...fileData,
            fileContent,
        };

        contributorsMetaData = await getFileContributorsMetadata(updatedFileData, vcsConnector);
    }

    return contributorsMetaData;
}

function getUpdatedMetadataString(newMetadatas: string[], defaultMetadata = ''): string {
    const metadataСarriage = '\r\n';
    const metadataBorder = `---${metadataСarriage}`;

    const newMetadata = newMetadatas.join(metadataСarriage);
    const preparedDefaultMetadata = defaultMetadata.trimRight();
    const defaultMetadataСarriage = preparedDefaultMetadata ? metadataСarriage : '';
    const updatedMetadata = `${preparedDefaultMetadata}${defaultMetadataСarriage}${newMetadata}${metadataСarriage}`;

    return `${metadataBorder}${updatedMetadata}${metadataBorder}`;
}

async function getUpdatedMetadata(options: MetaDataOptions, fileContent: string, meta?: Metadata): Promise<Metadata> {
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

async function getContributorsMetadata(options: MetaDataOptions, fileContent: string): Promise<string> {
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

async function getAuthorMetadata(meta: Metadata, vcsConnector?: VCSConnector): Promise<string | null> {
    if (meta.author && vcsConnector) {
        const updatedAuthor = await getAuthorDetails(vcsConnector, meta.author);

        return updatedAuthor;
    }

    return null;
}

function getSystemVarsMetadataString(systemVars: object) {
    return `__system: ${JSON.stringify(systemVars)}`;
}

export {
    getContentWithUpdatedMetadata,
    getContentWithUpdatedStaticMetadata,
    getUpdatedMetadata,
};
