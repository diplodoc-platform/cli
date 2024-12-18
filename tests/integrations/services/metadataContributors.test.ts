import {readFileSync} from 'fs';
import {normalize} from 'path';
import {Contributor, Contributors, MetaDataOptions} from 'models';
import {enrichWithFrontMatter} from 'services/metadata';
import {VCSConnector} from 'vcs-connector/connector-models';
import {extractFrontMatter} from '@diplodoc/transform/lib/frontmatter';

const simpleMetadataFilePath = 'mocks/fileContent/metadata/simpleMetadata.md';
const withoutMetadataFilePath = 'mocks/fileContent/metadata/withoutMetadata.md';
const withIncludesFilePath = 'mocks/fileContent/metadata/includesContent/withIncludes.md';
const firstIncludeFilePath = 'mocks/fileContent/metadata/includesContent/firstIncludeFile.md';
const secondIncludeFilePath = 'mocks/fileContent/metadata/includesContent/secondIncludeFile.md';

describe('getContentWithUpdatedMetadata (Contributors)', () => {
    const metadataOptions: MetaDataOptions = {
        pathData: {
            pathToFile: '',
            resolvedPathToFile: '' as AbsolutePath,
            filename: '',
            fileBaseName: '',
            fileExtension: '',
            outputDir: '' as AbsolutePath,
            outputPath: '' as AbsolutePath,
            outputFormat: '',
            outputBundlePath: '',
            outputTocDir: '',
            inputFolderPath: '',
            outputFolderPath: '',
        },
    };

    const defaultVCSConnector: VCSConnector = {
        addNestedContributorsForPath: () => {},
        getContributorsByPath: () => Promise.resolve(null),
        getUserByLogin: () => Promise.resolve(null),
        getExternalAuthorByPath: () => null,
        getModifiedTimeByPath: () => undefined,
    };

    describe(
        'should return file content with updated contributors in metadata ' +
            'if metadata options has "isContributorsEnabled" equals true.',
        () => {
            beforeAll(() => {
                metadataOptions.isContributorsEnabled = true;
                metadataOptions.vcsConnector = defaultVCSConnector;
            });

            test('"getContributorsByPath" does not return any contributors with includes contributors', async () => {
                metadataOptions.vcsConnector.getContributorsByPath = () =>
                    Promise.resolve({
                        contributors: {},
                        hasIncludes: true,
                    });
                const fileContent = readFileSync(simpleMetadataFilePath, 'utf8');

                const updatedFileContent = await enrichWithFrontMatter({
                    fileContent,
                    metadataOptions,
                    resolvedFrontMatterVars: {},
                });

                const [originalMeta] = extractFrontMatter(fileContent);
                const [updatedMeta] = extractFrontMatter(updatedFileContent);

                expect(updatedMeta).toEqual(originalMeta);
            });

            test(
                'File content does not have metadata and' +
                    '"getContributorsByPath" does not return any contributors with includes contributors',
                async () => {
                    metadataOptions.vcsConnector.getContributorsByPath = () =>
                        Promise.resolve({
                            contributors: {},
                            hasIncludes: true,
                        });
                    const fileContent = readFileSync(withoutMetadataFilePath, 'utf8');

                    const updatedFileContent = await enrichWithFrontMatter({
                        fileContent,
                        metadataOptions,
                        resolvedFrontMatterVars: {},
                    });

                    const [originalMeta] = extractFrontMatter(fileContent);
                    const [updatedMeta] = extractFrontMatter(updatedFileContent);

                    expect(updatedMeta).toEqual(originalMeta);
                },
            );

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
                const expectedContributorsArray: Contributor[] =
                    Object.values(expectedContributors);

                metadataOptions.vcsConnector.getContributorsByPath = () =>
                    Promise.resolve({
                        contributors: expectedContributors,
                        hasIncludes: true,
                    });
                const fileContent = readFileSync(simpleMetadataFilePath, 'utf8');

                const updatedFileContent = await enrichWithFrontMatter({
                    fileContent,
                    metadataOptions,
                    resolvedFrontMatterVars: {},
                });

                const [originalMeta] = extractFrontMatter(fileContent);
                const [updatedMeta] = extractFrontMatter(updatedFileContent);

                const expectedMeta = {
                    ...originalMeta,
                    contributors: expectedContributorsArray,
                };

                expect(updatedMeta).toEqual(expectedMeta);
            });

            test(
                '"getContributorsByPath" returns contributors without includes contributors and ' +
                    'file content does not have include contents',
                async () => {
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
                    const expectedContributorsArray: Contributor[] =
                        Object.values(expectedContributors);

                    metadataOptions.vcsConnector.getContributorsByPath = () =>
                        Promise.resolve({
                            contributors: expectedContributors,
                            hasIncludes: false,
                        });
                    const fileContent = readFileSync(simpleMetadataFilePath, 'utf8');

                    const updatedFileContent = await enrichWithFrontMatter({
                        fileContent,
                        metadataOptions,
                        resolvedFrontMatterVars: {},
                    });

                    const [originalMeta] = extractFrontMatter(fileContent);
                    const [updatedMeta] = extractFrontMatter(updatedFileContent);

                    const expectedMeta = {
                        ...originalMeta,
                        contributors: expectedContributorsArray,
                    };

                    expect(updatedMeta).toEqual(expectedMeta);
                },
            );

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
                        [includesContributorFromSecondFile.email]:
                            includesContributorFromSecondFile,
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
                test(
                    '"getContributorsByPath" returns contributors from main ' +
                        `and includes files and ${item.title}`,
                    async () => {
                        metadataOptions.vcsConnector.getContributorsByPath = (path: string) =>
                            Promise.resolve({
                                contributors: getFileContributors(path),
                                hasIncludes: item.getHasIncludes(path),
                            });
                        metadataOptions.pathData.resolvedPathToFile = withIncludesFilePath as AbsolutePath;
                        const fileContent = readFileSync(withIncludesFilePath, 'utf8');

                        const updatedFileContent = await enrichWithFrontMatter({
                            fileContent,
                            metadataOptions,
                            resolvedFrontMatterVars: {},
                        });

                        const [originalMeta] = extractFrontMatter(fileContent);
                        const [updatedMeta] = extractFrontMatter(updatedFileContent);

                        const expectedMeta = {
                            ...originalMeta,
                            contributors: item.expectedContributorsArray,
                        };

                        expect(updatedMeta).toEqual(expectedMeta);
                    },
                );
            });
        },
    );

    describe('should return file content without updated contributors in metadata', () => {
        test('if metadata options has "isContributorsEnabled" equals false', async () => {
            metadataOptions.isContributorsEnabled = false;
            metadataOptions.vcsConnector = defaultVCSConnector;
            const fileContent = readFileSync(simpleMetadataFilePath, 'utf8');

            const updatedFileContent = await enrichWithFrontMatter({
                fileContent,
                metadataOptions,
                resolvedFrontMatterVars: {},
            });

            const [metadataBeforeEnrichment] = extractFrontMatter(fileContent);
            const [metadataAfterEnrichment] = extractFrontMatter(updatedFileContent);

            expect(metadataAfterEnrichment).toEqual(metadataBeforeEnrichment);
        });

        test(
            'if metadata options has "isContributorsEnabled" equals true ' +
                'and "vcsConnector" equals undefined',
            async () => {
                metadataOptions.isContributorsEnabled = true;
                metadataOptions.vcsConnector = undefined;
                const fileContent = readFileSync(simpleMetadataFilePath, 'utf8');

                const updatedFileContent = await enrichWithFrontMatter({
                    fileContent,
                    metadataOptions,
                    resolvedFrontMatterVars: {},
                });

                const [metadataBeforeEnrichment] = extractFrontMatter(fileContent);
                const [metadataAfterEnrichment] = extractFrontMatter(updatedFileContent);

                expect(metadataAfterEnrichment).toEqual(metadataBeforeEnrichment);
            },
        );
    });
});
