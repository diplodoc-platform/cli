import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { Contributor, Contributors, FileData } from '../models';
import { FileContributors, VCSConnector } from '../vcs-connector/models';
import { getUpdatedAuthorString } from './authors';

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

        return `${getUpdatedMetadata(contributorsValue, vcsConnector, fileMetadata)}${fileMainContent}`;
    }

    return `${getUpdatedMetadata(contributorsValue, vcsConnector)}${fileData.fileContent}`;
}

async function getFileContributorsString(fileData: FileData, vcsConnector: VCSConnector): Promise<string> {
    const {tmpInputFilePath, inputFolderPathLength} = fileData;

    const relativeFilePath = tmpInputFilePath.substring(inputFolderPathLength);
    const fileContributors: FileContributors = await vcsConnector.getContributorsByPath(relativeFilePath);
    const nestedContributors: Contributors = await getContributorsForNestedFiles(fileData, vcsConnector);

    const fileContributorsWithContributorsIncludedFiles: Contributors = {
        ...fileContributors.contributors,
        ...nestedContributors,
    };

    const contributorsArray: Contributor[] =
        Object.entries(fileContributorsWithContributorsIncludedFiles).map(([, contributor]) => contributor);

    return JSON.stringify(contributorsArray).replace(/"/g, '\'');
}

async function getContributorsForNestedFiles(fileData: FileData, vcsConnector: VCSConnector): Promise<Contributors> {
    const { fileContent, inputFolderPathLength } = fileData;

    // Include example: {% include [createfolder](create-folder.md) %}
    // Regexp result: [createfolder](create-folder.md)
    const regexpIncludeContents = /(?<=[{%]\sinclude\s).+(?=\s[%}])/gm;


    const includeContents = fileContent.match(regexpIncludeContents);
    if (!includeContents || includeContents.length === 0) {
        return {};
    }

    const includesContributors: Contributors[] = [];

    const relativeIncludeFilePaths: Set<string> = getRelativeIncludeFilePaths(fileData, includeContents);

    for (const relativeIncludeFilePath of relativeIncludeFilePaths.values()) {
        const relativeFilePath = relativeIncludeFilePath.substring(inputFolderPathLength);
        let includeContributors = await vcsConnector.getContributorsByPath(relativeFilePath);

        const contentIncludeFile: string = readFileSync(relativeIncludeFilePath, 'utf8');

        const newFileData: FileData = {
            ...fileData,
            fileContent: contentIncludeFile,
            tmpInputFilePath: relativeIncludeFilePath,
        };

        const nestedContributors = await getContributorsForNestedFiles(newFileData, vcsConnector);

        includesContributors.push(includeContributors.contributors);
        includesContributors.push(nestedContributors);
    }

    return Object.assign({}, ...includesContributors);
}

function getRelativeIncludeFilePaths(fileData: FileData, includeContents: string[]): Set<string> {
    const { tmpInputFilePath } = fileData;
    const relativeIncludeFilePaths: Set<string> = new Set();

    // Include example: [createfolder](create-folder.md)
    // Regexp result: create-folder.md
    const regexpIncludeFilePath = /(?<=[(]).+(?=[)])/g;

    includeContents.forEach((includeContent: string) => {
        const relativeIncludeFilePath = includeContent.match(regexpIncludeFilePath);

        if (relativeIncludeFilePath && relativeIncludeFilePath.length !== 0) {
            const relativeIncludeFilePathWithoutHash = relativeIncludeFilePath[0].split('#');
            const includeFilePath = join(dirname(tmpInputFilePath), relativeIncludeFilePathWithoutHash[0]);

            relativeIncludeFilePaths.add(includeFilePath);
        }
    });

    return relativeIncludeFilePaths;
}

async function getUpdatedMetadata(metaContributorsValue: string, vcsConnector: VCSConnector, defaultMetadata = ''): Promise<string> {
    const metadataСarriage = '\r\n';
    const metadataBorder = `---${metadataСarriage}`;

    let updatedDefaultMetadata = await getUpdatedAuthorString(vcsConnector, defaultMetadata);

    const newMetadata = `${updatedDefaultMetadata}${metadataСarriage}${metaContributorsValue}${metadataСarriage}`;

    return `${metadataBorder}${newMetadata}${metadataBorder}`;
}

export {
    addMetadata,
    getFileContributorsString,
};
