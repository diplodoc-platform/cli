import {readFile} from 'fs/promises';
import {dirname, join} from 'path';

import {replaceDoubleToSingleQuotes} from '../utils';
import {REGEXP_INCLUDE_CONTENTS, REGEXP_INCLUDE_FILE_PATH} from '../constants';
import {Contributor, Contributors} from '../models';
import {FileContributors, VCSConnector} from '../vcs-connector/connector-models';

export interface ContributorsServiceFileData {
    resolvedFilePath: string;
    inputFolderPathLength: number;
    fileContent: string;
}

async function getFileContributorsMetadata(
    fileData: ContributorsServiceFileData,
    vcsConnector: VCSConnector,
): Promise<string> {
    const contributors = await getFileContributorsString(fileData, vcsConnector);

    return `contributors: ${contributors}`;
}

async function getFileContributorsString(
    fileData: ContributorsServiceFileData,
    vcsConnector: VCSConnector,
): Promise<string> {
    const {resolvedFilePath, inputFolderPathLength} = fileData;

    const relativeFilePath = resolvedFilePath.substring(inputFolderPathLength);
    const fileContributors: FileContributors =
        await vcsConnector.getContributorsByPath(relativeFilePath);
    let nestedContributors: Contributors = {};

    if (!fileContributors.hasIncludes) {
        nestedContributors = await getContributorsForNestedFiles(fileData, vcsConnector);
        vcsConnector.addNestedContributorsForPath(relativeFilePath, nestedContributors);
    }

    const fileContributorsWithContributorsIncludedFiles: Contributors = {
        ...fileContributors.contributors,
        ...nestedContributors,
    };

    const contributorsArray: Contributor[] = Object.entries(
        fileContributorsWithContributorsIncludedFiles,
    ).map(([, contributor]) => contributor);

    return replaceDoubleToSingleQuotes(JSON.stringify(contributorsArray));
}

async function getContributorsForNestedFiles(
    fileData: ContributorsServiceFileData,
    vcsConnector: VCSConnector,
): Promise<Contributors> {
    const {fileContent, inputFolderPathLength} = fileData;

    const includeContents = fileContent.match(REGEXP_INCLUDE_CONTENTS);
    if (!includeContents || includeContents.length === 0) {
        return {};
    }

    const includesContributors: Contributors[] = [];
    const relativeIncludeFilePaths: Set<string> = getRelativeIncludeFilePaths(
        fileData,
        includeContents,
    );

    for (const relativeIncludeFilePath of relativeIncludeFilePaths.values()) {
        const relativeFilePath = relativeIncludeFilePath.substring(inputFolderPathLength);
        const includeContributors = await vcsConnector.getContributorsByPath(relativeFilePath);

        let nestedContributors: Contributors = {};

        if (!includeContributors.hasIncludes) {
            let contentIncludeFile: string;
            try {
                contentIncludeFile = await readFile(relativeIncludeFilePath, 'utf8');
            } catch (err) {
                if (err.code === 'ENOENT') {
                    continue;
                }
                throw err;
            }

            const newFileData: ContributorsServiceFileData = {
                ...fileData,
                fileContent: contentIncludeFile,
                resolvedFilePath: relativeIncludeFilePath,
            };

            nestedContributors = await getContributorsForNestedFiles(newFileData, vcsConnector);
            vcsConnector.addNestedContributorsForPath(relativeFilePath, nestedContributors);
        }

        includesContributors.push(includeContributors.contributors);
        includesContributors.push(nestedContributors);
    }

    return Object.assign({}, ...includesContributors);
}

function getRelativeIncludeFilePaths(
    {resolvedFilePath: tmpInputFilePath}: ContributorsServiceFileData,
    includeContents: string[],
): Set<string> {
    const relativeIncludeFilePaths: Set<string> = new Set();

    includeContents.forEach((includeContent: string) => {
        const relativeIncludeFilePath = includeContent.match(REGEXP_INCLUDE_FILE_PATH);

        if (relativeIncludeFilePath && relativeIncludeFilePath.length !== 0) {
            const relativeIncludeFilePathWithoutHash = relativeIncludeFilePath[0].split('#');
            const includeFilePath = join(
                dirname(tmpInputFilePath),
                relativeIncludeFilePathWithoutHash[0],
            );

            relativeIncludeFilePaths.add(includeFilePath);
        }
    });

    return relativeIncludeFilePaths;
}

async function getFileIncludes(fileData: ContributorsServiceFileData) {
    const {fileContent, inputFolderPathLength} = fileData;

    const results = new Set<string>();

    const includeContents = fileContent.match(REGEXP_INCLUDE_CONTENTS);
    if (!includeContents || includeContents.length === 0) {
        return [];
    }
    const relativeIncludeFilePaths: Set<string> = getRelativeIncludeFilePaths(
        fileData,
        includeContents,
    );
    for (const relativeIncludeFilePath of relativeIncludeFilePaths.values()) {
        const relativeFilePath = relativeIncludeFilePath.substring(inputFolderPathLength + 1);
        if (results.has(relativeFilePath)) continue;
        results.add(relativeFilePath);

        let contentIncludeFile: string;
        try {
            contentIncludeFile = await readFile(relativeIncludeFilePath, 'utf8');
        } catch (err) {
            if (err.code === 'ENOENT') {
                continue;
            }
            throw err;
        }

        const includedPaths = await getFileIncludes({
            inputFolderPathLength,
            fileContent: contentIncludeFile,
            resolvedFilePath: relativeIncludeFilePath,
        });
        includedPaths.forEach((path) => results.add(path));
    }

    return Array.from(results.values());
}

export {getFileContributorsMetadata, getFileContributorsString, getFileIncludes};
