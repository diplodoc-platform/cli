import {readFileSync} from 'fs';
import {REGEXP_AUTHOR} from '../../../src/constants';
import {replaceDoubleToSingleQuotes} from '../../../src/utils/markup';
import {MetaDataOptions} from 'models';
import {getContentWithUpdatedMetadata} from 'services/metadata';
import {VCSConnector} from 'vcs-connector/connector-models';

const authorAliasInMetadataFilePath = 'mocks/fileContent/metadata/authorAliasInMetadata.md';
const fullAuthorInMetadataFilePath = 'mocks/fileContent/metadata/fullAuthorInMetadata.md';
const simpleMetadataFilePath = 'mocks/fileContent/metadata/simpleMetadata.md';

jest.mock('services/contributors', () => ({
    getFileContributorsMetadata: () => Promise.resolve(''),
}));

describe('getContentWithUpdatedMetadata (Authors)', () => {
    const expectedAuthorData = {
        avatar: 'https://example.ru/logo.png',
        name: 'Name Surname',
        url: 'https://example.ru',
        email: 'alias@yandex.ru',
        login: 'alias',
    };

    const defaultVCSConnector: VCSConnector = {
        addNestedContributorsForPath: () => { },
        getContributorsByPath: () => Promise.resolve(null),
        getUserByLogin: () => Promise.resolve(expectedAuthorData),
    };

    describe('should return file content with updated author in metadata', () => {
        let metaDataOptions: MetaDataOptions;

        beforeAll(() => {
            metaDataOptions = {
                fileData: {},
                isContributorsEnabled: true,
                vcsConnector: defaultVCSConnector,
            };
        });

        test('if metadata has author alias', async () => {
            const fileContent = readFileSync(authorAliasInMetadataFilePath, 'utf8');
            const matchAuthor = fileContent.match(REGEXP_AUTHOR);

            const updatedFileContent = await getContentWithUpdatedMetadata(fileContent, metaDataOptions);
            const expectedFileContent = fileContent
                .replace(matchAuthor[0], replaceDoubleToSingleQuotes(JSON.stringify(expectedAuthorData)));

            expect(updatedFileContent).toEqual(expectedFileContent);
        });

        test('if metadata has full author data', async () => {
            const fileContent = readFileSync(fullAuthorInMetadataFilePath, 'utf8');
            const matchAuthor = fileContent.match(REGEXP_AUTHOR);

            const updatedFileContent = await getContentWithUpdatedMetadata(fileContent, metaDataOptions);
            const expectedFileContent = fileContent
                .replace(matchAuthor[0], replaceDoubleToSingleQuotes(matchAuthor[0]));

            expect(updatedFileContent).toEqual(expectedFileContent);
        });
    });

    describe('should return file content without updated author in metadata', () => {
        const metaDataOptions: MetaDataOptions = {
            fileData: {},
        };

        test('if metadata options has "isContributorsEnabled" equals false', async () => {
            metaDataOptions.isContributorsEnabled = false;
            metaDataOptions.vcsConnector = defaultVCSConnector;
            const fileContent = readFileSync(authorAliasInMetadataFilePath, 'utf8');

            const updatedFileContent = await getContentWithUpdatedMetadata(fileContent, metaDataOptions);

            expect(updatedFileContent).toEqual(fileContent);
        });

        test('if metadata options has "isContributorsEnabled" equals true ' +
            'and "vcsConnector" equals undefined', async () => {
            metaDataOptions.isContributorsEnabled = true;
            metaDataOptions.vcsConnector = undefined;
            const fileContent = readFileSync(authorAliasInMetadataFilePath, 'utf8');

            const updatedFileContent = await getContentWithUpdatedMetadata(fileContent, metaDataOptions);

            expect(updatedFileContent).toEqual(fileContent);
        });

        test('if metadata options has "isContributorsEnabled" equals true ' +
            'and "getUserByLogin" returns null', async () => {
            metaDataOptions.isContributorsEnabled = true;
            metaDataOptions.vcsConnector = {
                ...defaultVCSConnector,
                getUserByLogin: () => Promise.resolve(null),
            };
            const fileContent = readFileSync(authorAliasInMetadataFilePath, 'utf8');

            const updatedFileContent = await getContentWithUpdatedMetadata(fileContent, metaDataOptions);

            expect(updatedFileContent).toEqual(fileContent);
        });

        test('if metadata does not have author', async () => {
            metaDataOptions.isContributorsEnabled = true;
            metaDataOptions.vcsConnector = defaultVCSConnector;
            const fileContent = readFileSync(simpleMetadataFilePath, 'utf8');

            const updatedFileContent = await getContentWithUpdatedMetadata(fileContent, metaDataOptions);

            expect(updatedFileContent).toEqual(fileContent);
        });

        test('if metadata does not have author', async () => {
            metaDataOptions.isContributorsEnabled = true;
            metaDataOptions.vcsConnector = defaultVCSConnector;
            const fileContent = readFileSync(simpleMetadataFilePath, 'utf8');

            const updatedFileContent = await getContentWithUpdatedMetadata(fileContent, metaDataOptions);

            expect(updatedFileContent).toEqual(fileContent);
        });
    });
});
