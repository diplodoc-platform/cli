import {VCSConnector} from '../vcs-connector/connector-models';
import {MetaDataOptions} from '../models';
import {getAuthorDetails, updateAuthorMetadataString} from './authors';
import {getFileContributorsMetadata, getFileContributorsString} from './contributors';
import {replaceDoubleToSingleQuotes} from '../utils';
import {isObject} from './utils';

async function getContentWithUpdatedMetadata(
    fileContent: string,
    options?: MetaDataOptions,
    systemVars?: unknown,
): Promise<string> {
    if (!options?.isContributorsEnabled && !systemVars) {
        return fileContent;
    }
    // Search by format:
    // ---
    // metaName1: metaValue1
    // metaName2: meta value2
    // incorrectMetadata
    // ---
    const regexpMetadata = '(?<=-{3}\\r?\\n)((.*\\r?\\n)*)(?=-{3}\\r?\\n)';
    // Search by format:
    // ---
    // main content 123
    const regexpFileContent = '---((.*[\r?\n]*)*)';

    const regexpParseFileContent = new RegExp(`${regexpMetadata}${regexpFileContent}`, 'gm');
    const matches = regexpParseFileContent.exec(fileContent);

    const newMetadatas = [];

    if (systemVars && isObject(systemVars)) {
        newMetadatas.push(getSystemVarsMetadataString(systemVars));
    }

    if (options) {
        if (options.isContributorsEnabled) {
            newMetadatas.push(await getContributorsMetadataString(options, fileContent));
        }

        if (matches && matches.length > 0) {
            const [, fileMetadata, , fileMainContent] = matches;
            let updatedDefaultMetadata = '';

            updatedDefaultMetadata = await updateAuthorMetadataString(fileMetadata, options.vcsConnector);

            return `${getUpdatedMetadataString(newMetadatas, updatedDefaultMetadata)}${fileMainContent}`;
        }
    }

    return `${getUpdatedMetadataString(newMetadatas)}${fileContent}`;
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
    const updatedMetadata = `${defaultMetadata}${metadataСarriage}${newMetadata}${metadataСarriage}`;

    return `${metadataBorder}${updatedMetadata}${metadataBorder}`;
}

async function getUpdatedMetadata(result: any, options: MetaDataOptions, fileContent: string): Promise<Record<string, any>> {
    const {vcsConnector} = options;

    const newMetadata: Record<string, any> = {
        contributors: await getContributorsMetadata(options, fileContent),
    };

    if (!result.meta) {
        return newMetadata;
    }

    const {meta} = result;
    const updatedMetadata = {
        ...meta,
    };

    const updatedAuthor = await getAuthorMetadata(meta as Record<string, any>, vcsConnector);

    return {
        ...updatedMetadata,
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

async function getAuthorMetadata(meta: Record<string, any>, vcsConnector?: VCSConnector): Promise<string | null> {
    if (meta.author && vcsConnector) {
        const updatedAuthor = await getAuthorDetails(vcsConnector, meta.author);

        return updatedAuthor;
    }

    return null;
}

function getSystemVarsMetadataString(systemVars: object) {
    const stringifiedVars = replaceDoubleToSingleQuotes(JSON.stringify(systemVars));

    return `__system: ${stringifiedVars}`;
}

export {
    getContentWithUpdatedMetadata,
    getUpdatedMetadata,
};
