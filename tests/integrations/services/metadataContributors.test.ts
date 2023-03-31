import os from 'os';
import {readFileSync} from 'fs';
import {normalize} from 'path';
import {metadataBorder} from '../../../src/constants';
import {сarriage, replaceDoubleToSingleQuotes} from '../../../src/utils/markup';
import {Contributor, Contributors, MetaDataOptions} from 'models';
import {getContentWithUpdatedMetadata} from 'services/metadata';
import {VCSConnector} from 'vcs-connector/connector-models';

const simpleMetadataFilePath = 'mocks/fileContent/metadata/simpleMetadata.md';
const withoutMetadataFilePath = 'mocks/fileContent/metadata/withoutMetadata.md';
const withIncludesFilePath = 'mocks/fileContent/metadata/includesContent/withIncludes.md';
const firstIncludeFilePath = 'mocks/fileContent/metadata/includesContent/firstIncludeFile.md';
const secondIncludeFilePath = 'mocks/fileContent/metadata/includesContent/secondIncludeFile.md';

describe('getContentWithUpdatedMetadata (Contributors)', () => {
    const metaDataOptions: MetaDataOptions = {
        fileData: {
            tmpInputFilePath: '',
            inputFolderPathLength: 0,
            fileContent: '',
        },
    };

    const defaultVCSConnector: VCSConnector = {
        addNestedContributorsForPath: () => { },
        getContributorsByPath: () => Promise.resolve(null),
        getUserByLogin: () => Promise.resolve(null),
    };

    describe('should return file content with updated contributors in metadata ' +
        'if metadata options has "isContributorsEnabled" equals true.', () => {
        beforeAll(() => {
            metaDataOptions.isContributorsEnabled = true;
            metaDataOptions.vcsConnector = defaultVCSConnector;
        });

        test('"getContributorsByPath" does not return any contributors with includes contributors', async () => {
            metaDataOptions.vcsConnector.getContributorsByPath = () => Promise.resolve({
                contributors: {},
                hasIncludes: true,
            });
            const fileContent = readFileSync(simpleMetadataFilePath, 'utf8');

            const updatedFileContent = await getContentWithUpdatedMetadata(fileContent, metaDataOptions);

            const splitedFiledContent = fileContent.split(metadataBorder);
            splitedFiledContent[1] = `${splitedFiledContent[1]}contributors: []${сarriage}`;
            const expectedFileContent = splitedFiledContent.join(metadataBorder);
            expect(updatedFileContent).toEqual(expectedFileContent);
        });

        test('File content does not have metadata and' +
                '"getContributorsByPath" does not return any contributors with includes contributors', async () => {
            metaDataOptions.vcsConnector.getContributorsByPath = () => Promise.resolve({
                contributors: {},
                hasIncludes: true,
            });
            const fileContent = readFileSync(withoutMetadataFilePath, 'utf8');

            const updatedFileContent = await getContentWithUpdatedMetadata(fileContent, metaDataOptions);

            const border = `${metadataBorder}${сarriage}`;
            const newMetadata = `${border}contributors: []${сarriage}${border}`;
            const expectedFileContent = `${newMetadata}${fileContent}`;
            expect(updatedFileContent).toEqual(expectedFileContent);
        });


        test('"getContributorsByPath" returns contributors with includes contributors', async () => {
            const contributorFirst: Contributor = {
                avatar: 'https://example.ru/logo.png',
                name: 'Name Surname 1',
                url: 'https://example.ru',
                email: 'alias_1@yandex.ru',
                login: 'alias_1',
            };
            const contributorSecond: Contributor = {
                avatar: 'https://example.ru/logo.png',
                name: 'Name Surname 2',
                url: 'https://example.ru',
                email: 'alias_2@yandex.ru',
                login: 'alias_2',
            };
            const expectedContributors: Contributors = {
                [contributorFirst.email]: contributorFirst,
                [contributorSecond.email]: contributorSecond,
            };
            const expectedAuthorString: string = replaceDoubleToSingleQuotes(
                JSON.stringify(contributorFirst));
            const expectedContributorsArray: Contributor[] = Object.values(expectedContributors);
            const expectedContributorsString: string =
                replaceDoubleToSingleQuotes(JSON.stringify(expectedContributorsArray));

            metaDataOptions.vcsConnector.getContributorsByPath = () => Promise.resolve({
                contributors: expectedContributors,
                hasIncludes: true,
            });
            const fileContent = readFileSync(simpleMetadataFilePath, 'utf8');

            const updatedFileContent = await getContentWithUpdatedMetadata(fileContent, metaDataOptions);

            const splitedFiledContent = fileContent.split(metadataBorder);
            splitedFiledContent[1] =
                `${splitedFiledContent[1]}${os.EOL}author: ${expectedAuthorString}${os.EOL}contributors: ${expectedContributorsString}${сarriage}`;
            const expectedFileContent = splitedFiledContent.join(metadataBorder);
            expect(updatedFileContent).toEqual(expectedFileContent);
        });

        test('"getContributorsByPath" returns contributors without includes contributors and ' +
                'file content does not have include contents', async () => {
            const contributorFirst: Contributor = {
                avatar: 'https://example.ru/logo.png',
                name: 'Name Surname 1',
                url: 'https://example.ru',
                email: 'alias_1@yandex.ru',
                login: 'alias_1',
            };
            const expectedContributors: Contributors = {
                [contributorFirst.email]: contributorFirst,
            };
            const expectedAuthorString: string = replaceDoubleToSingleQuotes(
                JSON.stringify(contributorFirst));
            const expectedContributorsArray: Contributor[] = Object.values(expectedContributors);
            const expectedContributorsString: string =
                replaceDoubleToSingleQuotes(JSON.stringify(expectedContributorsArray));

            metaDataOptions.vcsConnector.getContributorsByPath = () => Promise.resolve({
                contributors: expectedContributors,
                hasIncludes: false,
            });
            const fileContent = readFileSync(simpleMetadataFilePath, 'utf8');

            const updatedFileContent = await getContentWithUpdatedMetadata(fileContent, metaDataOptions);

            const splitedFiledContent = fileContent.split(metadataBorder);
            splitedFiledContent[1] =
                `${splitedFiledContent[1]}${os.EOL}author: ${expectedAuthorString}${os.EOL}contributors: ${expectedContributorsString}${сarriage}`;
            const expectedFileContent = splitedFiledContent.join(metadataBorder);
            expect(updatedFileContent).toEqual(expectedFileContent);
        });

        const contributorFirst: Contributor = {
            avatar: 'https://example.ru/logo.png',
            name: 'Name Surname 1',
            url: 'https://example.ru',
            email: 'alias_1@yandex.ru',
            login: 'alias_1',
        };
        const includesContributorFromFirstFile: Contributor = {
            avatar: 'https://example.ru/logo.png',
            name: 'Name Surname includes 1',
            url: 'https://example.ru',
            email: 'alias_includes_1@yandex.ru',
            login: 'alias_includes_1',
        };
        const includesContributorFromSecondFile: Contributor = {
            avatar: 'https://example.ru/logo.png',
            name: 'Name Surname includes 2',
            url: 'https://example.ru',
            email: 'alias_includes_2@yandex.ru',
            login: 'alias_includes_2',
        };

        const getFileContributors = (path: string): Contributors => {
            if (path === normalize(firstIncludeFilePath)) {
                return {
                    [includesContributorFromFirstFile.email]: includesContributorFromFirstFile,
                };
            }

            if (path === normalize(secondIncludeFilePath)) {
                return {
                    [includesContributorFromSecondFile.email]: includesContributorFromSecondFile,
                };
            }

            return {
                [contributorFirst.email]: contributorFirst,
            };
        };

        [
            {
                title: 'when all files does not have information about includes contributors',
                getHasIncludes: () => false,
                expectedContributorsArray: [
                    contributorFirst,
                    includesContributorFromFirstFile,
                    includesContributorFromSecondFile,
                ],
            },
            {
                title: 'when first include file has information about includes contributors',
                getHasIncludes: (path: string) => path === normalize(firstIncludeFilePath),
                expectedContributorsArray: [contributorFirst, includesContributorFromFirstFile],
            },
        ].forEach((item) => {
            test('"getContributorsByPath" returns contributors from main ' +
                `and includes files and ${item.title}`, async () => {
                const expectedContributorsString: string = replaceDoubleToSingleQuotes(
                    JSON.stringify(item.expectedContributorsArray));
                const expectedAuthorString: string = replaceDoubleToSingleQuotes(
                    JSON.stringify(contributorFirst));
                metaDataOptions.vcsConnector.getContributorsByPath = (path: string) => Promise.resolve({
                    contributors: getFileContributors(path),
                    hasIncludes: item.getHasIncludes(path),
                });
                metaDataOptions.fileData.tmpInputFilePath = withIncludesFilePath;
                const fileContent = readFileSync(withIncludesFilePath, 'utf8');

                const updatedFileContent = await getContentWithUpdatedMetadata(fileContent, metaDataOptions);

                const splitedFiledContent = fileContent.split(metadataBorder);
                splitedFiledContent[1] =
                    `${splitedFiledContent[1]}${os.EOL}author: ${expectedAuthorString}${os.EOL}contributors: ${expectedContributorsString}${сarriage}`;
                const expectedFileContent = splitedFiledContent.join(metadataBorder);
                expect(updatedFileContent).toEqual(expectedFileContent);
            });
        });
    });

    describe('should return file content without updated contributors in metadata', () => {
        test('if metadata options has "isContributorsEnabled" equals false', async () => {
            metaDataOptions.isContributorsEnabled = false;
            metaDataOptions.vcsConnector = defaultVCSConnector;
            const fileContent = readFileSync(simpleMetadataFilePath, 'utf8');

            const updatedFileContent = await getContentWithUpdatedMetadata(fileContent, metaDataOptions);

            expect(updatedFileContent).toEqual(fileContent);
        });

        test('if metadata options has "isContributorsEnabled" equals true ' +
            'and "vcsConnector" equals undefined', async () => {
            metaDataOptions.isContributorsEnabled = true;
            metaDataOptions.vcsConnector = undefined;
            const fileContent = readFileSync(simpleMetadataFilePath, 'utf8');


            const updatedFileContent = await getContentWithUpdatedMetadata(fileContent, metaDataOptions);

            expect(updatedFileContent).toEqual(fileContent);
        });
    });
});
