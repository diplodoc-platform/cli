import {readFileSync} from 'fs';
import {MetaDataOptions} from 'models';
import {enrichWithFrontMatter} from 'services/metadata';
import {parseExistingMetadata} from 'services/metadata/parse';
import {VCSConnector} from 'vcs-connector/connector-models';

const authorAliasInMetadataFilePath = 'mocks/fileContent/metadata/authorAliasInMetadata.md';
const fullAuthorInMetadataFilePath = 'mocks/fileContent/metadata/fullAuthorInMetadata.md';
const simpleMetadataFilePath = 'mocks/fileContent/metadata/simpleMetadata.md';

jest.mock('services/contributors', () => ({
    getFileContributors: () => Promise.resolve([]),
    getFileIncludes: () => Promise.resolve([]),
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
        addNestedContributorsForPath: () => {},
        getContributorsByPath: () => Promise.resolve(null),
        getUserByLogin: () => Promise.resolve(expectedAuthorData),
        getExternalAuthorByPath: () => expectedAuthorData,
        getModifiedTimeByPath: () => undefined,
    };

    describe('should return file content with updated author in metadata', () => {
        let metadataOptions: MetaDataOptions;

        beforeAll(() => {
            metadataOptions = {
                pathData: {
                    pathToFile: '',
                    resolvedPathToFile: '',
                    filename: '',
                    fileBaseName: '',
                    fileExtension: '',
                    outputDir: '',
                    outputPath: '',
                    outputFormat: '',
                    outputBundlePath: '',
                    outputTocDir: '',
                    inputFolderPath: '',
                    outputFolderPath: '',
                },
                isContributorsEnabled: true,
                vcsConnector: defaultVCSConnector,
            };
        });

        test('if metadata has author alias', async () => {
            const fileContent = readFileSync(authorAliasInMetadataFilePath, 'utf8');

            const updatedFileContent = await enrichWithFrontMatter({
                fileContent,
                metadataOptions,
                resolvedFrontMatterVars: {},
            });

            const {metadata: originalMeta} = parseExistingMetadata(fileContent);
            const {metadata: updatedMeta} = parseExistingMetadata(updatedFileContent);

            const expectedMeta = {
                ...originalMeta,
                author: expectedAuthorData,
            };

            expect(updatedMeta).toEqual(expectedMeta);
        });

        test('if metadata has full author data', async () => {
            const fileContent = readFileSync(fullAuthorInMetadataFilePath, 'utf8');

            const updatedFileContent = await enrichWithFrontMatter({
                fileContent,
                metadataOptions,
                resolvedFrontMatterVars: {},
            });

            const {metadata: originalMeta} = parseExistingMetadata(fileContent);
            const {metadata: updatedMeta} = parseExistingMetadata(updatedFileContent);

            expect(updatedMeta).toEqual(originalMeta);
        });
    });

    describe('should return file content without updated author in metadata', () => {
        const metadataOptions: MetaDataOptions = {
            pathData: {
                pathToFile: '',
                resolvedPathToFile: '',
                filename: '',
                fileBaseName: '',
                fileExtension: '',
                outputDir: '',
                outputPath: '',
                outputFormat: '',
                outputBundlePath: '',
                outputTocDir: '',
                inputFolderPath: '',
                outputFolderPath: '',
            },
        };

        test('if metadata options has "isContributorsEnabled" equals false', async () => {
            metadataOptions.isContributorsEnabled = false;
            metadataOptions.vcsConnector = defaultVCSConnector;
            const fileContent = readFileSync(authorAliasInMetadataFilePath, 'utf8');

            const updatedFileContent = await enrichWithFrontMatter({
                fileContent,
                metadataOptions,
                resolvedFrontMatterVars: {},
            });

            const {metadata: metadataBeforeEnrichment} = parseExistingMetadata(fileContent);
            const {metadata: metadataAfterEnrichment} = parseExistingMetadata(updatedFileContent);

            expect(metadataAfterEnrichment).toEqual(metadataBeforeEnrichment);
        });

        test(
            'if metadata options has "isContributorsEnabled" equals true ' +
                'and "vcsConnector" equals undefined',
            async () => {
                metadataOptions.isContributorsEnabled = true;
                metadataOptions.vcsConnector = undefined;
                const fileContent = readFileSync(authorAliasInMetadataFilePath, 'utf8');

                const updatedFileContent = await enrichWithFrontMatter({
                    fileContent,
                    metadataOptions,
                    resolvedFrontMatterVars: {},
                });

                const {metadata: metadataBeforeEnrichment} = parseExistingMetadata(fileContent);
                const {metadata: metadataAfterEnrichment} =
                    parseExistingMetadata(updatedFileContent);

                expect(metadataAfterEnrichment).toEqual(metadataBeforeEnrichment);
            },
        );

        test(
            'if metadata options has "isContributorsEnabled" equals true ' +
                'and "getUserByLogin" returns null',
            async () => {
                metadataOptions.isContributorsEnabled = true;
                metadataOptions.vcsConnector = {
                    ...defaultVCSConnector,
                    getUserByLogin: () => Promise.resolve(null),
                    getExternalAuthorByPath: () => null,
                };
                const fileContent = readFileSync(authorAliasInMetadataFilePath, 'utf8');

                const updatedFileContent = await enrichWithFrontMatter({
                    fileContent,
                    metadataOptions,
                    resolvedFrontMatterVars: {},
                });

                const {metadata: metadataBeforeEnrichment} = parseExistingMetadata(fileContent);
                const {metadata: metadataAfterEnrichment} =
                    parseExistingMetadata(updatedFileContent);

                expect(metadataAfterEnrichment).toEqual(metadataBeforeEnrichment);
            },
        );

        test('if metadata does not have author', async () => {
            metadataOptions.isContributorsEnabled = true;
            metadataOptions.vcsConnector = defaultVCSConnector;
            const fileContent = readFileSync(simpleMetadataFilePath, 'utf8');

            const updatedFileContent = await enrichWithFrontMatter({
                fileContent,
                metadataOptions,
                resolvedFrontMatterVars: {},
            });

            const {metadata: originalMeta} = parseExistingMetadata(fileContent);
            const {metadata: updatedMeta} = parseExistingMetadata(updatedFileContent);

            const expectedMeta = {
                ...originalMeta,
                author: expectedAuthorData,
            };

            expect(updatedMeta).toEqual(expectedMeta);
        });
    });
});
