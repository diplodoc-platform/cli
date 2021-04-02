import {FileData} from '../models';
import {VCSConnector} from '../vcsConnector/models';

async function addMetadata(fileData: FileData, vcsConnector: VCSConnector): Promise<string> {
    // Search by format:
    // ---
    // metaName1: metaValue1
    // metaName2: meta value2
    // incorrectMetadata
    // ---
    const regexpMetadata = '(?<=-{3}\\r\\n)((.*\\r\\n)*)(?=-{3}\\r\\n)';
    // Search by format:
    // ---
    // main content 123
    const regexpFileContent = '---((.*[\r\n]*)*)';
    const regexpParseFileContent = new RegExp(`${regexpMetadata}${regexpFileContent}`, 'gm');
    const matches = regexpParseFileContent.exec(fileData.fileContent);

    const contributors = await getFileContributorsString(fileData, vcsConnector);
    const contributorsValue = `contributors: ${contributors}`;

    if (matches && matches.length > 0) {
        const [, fileMetadata, , fileMainContent] = matches;

        return `${getUpdatedMetadata(contributorsValue, fileMetadata)}${fileMainContent}`;
    }

    return `${getUpdatedMetadata(contributorsValue)}${fileData.fileContent}`;
}

async function getFileContributorsString(fileData: FileData, vcsConnector: VCSConnector): Promise<string> {
    const {tmpInputfilePath, inputFolderPathLength} = fileData;

    const relativeFilePath = tmpInputfilePath.substring(inputFolderPathLength);
    const fileContributors = await vcsConnector.getContributorsByPath(relativeFilePath);

    return JSON.stringify(fileContributors).replace(/"/g, '\'');
}

function getUpdatedMetadata(metaContributorsValue: string, defaultMetadata = ''): string {
    const metadataСarriage = '\r\n';
    const metadataBorder = `---${metadataСarriage}`;

    const newMetadata = `${defaultMetadata}${metadataСarriage}${metaContributorsValue}${metadataСarriage}`;

    return `${metadataBorder}${newMetadata}${metadataBorder}`;
}

export {
    addMetadata,
    getFileContributorsString,
};
