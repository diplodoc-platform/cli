import {dump} from 'js-yaml';

import {VCSConnector} from '../vcs-connector/connector-models';
import {Metadata, MetaDataOptions, Resources} from '../models';
import {getAuthorDetails, updateAuthorMetadataString} from './authors';
import {getFileContributorsMetadata, getFileContributorsString} from './contributors';
import {isObject} from './utils';
import {сarriage} from '../utils';
import {metadataBorder} from '../constants';
import {dirname, relative, resolve} from 'path';
import {ArgvService} from './index';

async function getContentWithUpdatedMetadata(
    fileContent: string,
    options?: MetaDataOptions,
    systemVars?: unknown,
): Promise<string> {
    let result;

    result = getContentWithUpdatedStaticMetadata({
        fileContent,
        sourcePath: options?.fileData?.sourcePath,
        addSystemMeta: options?.addSystemMeta,
        addSourcePath: options?.addSourcePath,
        resources: options?.resources,
        systemVars,
    });
    result = await getContentWithUpdatedDynamicMetadata(result, options);

    return result;
}

function getContentWithUpdatedStaticMetadata({
    fileContent, sourcePath, addSystemMeta, addSourcePath, resources, systemVars,
}: {
    fileContent: string;
    sourcePath?: string;
    addSystemMeta?: boolean;
    addSourcePath?: boolean;
    resources?: Resources;
    systemVars?: unknown;
}): string {
    const newMetadatas: string[] = [];

    if ((!addSystemMeta || !systemVars) && !addSourcePath && !resources) {
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

        return `${getUpdatedMetadataString(newMetadatas, fileMetadata)}${fileMainContent}`;
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

    const matches = matchMetadata(fileContent);
    const newMetadatas: string[] = [];

    const {isContributorsEnabled} = options;

    if (isContributorsEnabled) {
        const contributorsMetaData = await getContributorsMetadataString(options, fileContent);

        if (contributorsMetaData) {
            newMetadatas.push(contributorsMetaData);
        }
    }

    if (matches && matches.length > 0) {
        const [, fileMetadata, , fileMainContent] = matches;
        let updatedDefaultMetadata = '';

        updatedDefaultMetadata = await updateAuthorMetadataString(fileMetadata, options.vcsConnector);

        return `${getUpdatedMetadataString(newMetadatas, updatedDefaultMetadata)}${fileMainContent}`;
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
    options: MetaDataOptions, fileContent: string,
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

function getUpdatedMetadataString(newMetadatas: string[], defaultMetadata = ''): string {
    const newMetadata = newMetadatas.join(сarriage) + (newMetadatas.length ? сarriage : '');
    const preparedDefaultMetadata = defaultMetadata.trimRight();
    const defaultMetadataСarriage = preparedDefaultMetadata ? сarriage : '';
    const updatedMetadata = `${preparedDefaultMetadata}${defaultMetadataСarriage}${newMetadata}`;

    return `${metadataBorder}${сarriage}${updatedMetadata}${metadataBorder}${defaultMetadata.length ? '' : сarriage}`;
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


function getAssetsPublicPath(filePath: string) {
    const {input} = ArgvService.getConfig();
    const path: string = resolve(input, filePath);

    /* Relative path from folder of .md file to root of user' output folder */
    return relative(dirname(path), resolve(input));
}

export {
    getContentWithUpdatedMetadata,
    getContentWithUpdatedStaticMetadata,
    getUpdatedMetadata,
    getAssetsPublicPath,
};
