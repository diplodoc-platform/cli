import {Contributor, Contributors, Metadata, MetaDataOptions} from 'models';
import {getVCSMetadata} from 'services/metadata';
import {replaceDoubleToSingleQuotes} from 'utils/markup';
import {VCSConnector} from 'vcs-connector/connector-models';

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
const contributors: Contributors = {
    [contributorFirst.email]: contributorFirst,
};
const contributorsArray: Contributor[] = Object.values(contributors);

jest.mock('services/contributors', () => ({
    getFileContributors: () => Promise.resolve(contributorsArray),
    getFileIncludes: () => Promise.resolve([]),
}));

const authorString: string = replaceDoubleToSingleQuotes(JSON.stringify(contributorSecond));

jest.mock('services/authors', () => ({
    getAuthorDetails: () => Promise.resolve(authorString),
}));

const defaultVCSConnector: VCSConnector = {
    addNestedContributorsForPath: () => {},
    getContributorsByPath: () => Promise.resolve(null),
    getUserByLogin: () => Promise.resolve(null),
    getExternalAuthorByPath: () => null,
    getModifiedTimeByPath: () => undefined,
};

describe('getUpdatedMetadata', () => {
    let metaDataOptions: MetaDataOptions;

    beforeEach(() => {
        metaDataOptions = {
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

    test('returns new metadata with empty contributors when "isContributorsEnabled" is false', async () => {
        const fileContent = '';
        const expectedMetadata = {
            contributors: [],
        };
        metaDataOptions.isContributorsEnabled = false;

        const newMetadata = await getVCSMetadata(metaDataOptions, fileContent);

        expect(newMetadata).toEqual(expectedMetadata);
    });

    test('returns new metadata with empty contributors when "vcsConnector" is undefined', async () => {
        const fileContent = '';
        const expectedMetadata = {
            contributors: [],
        };
        metaDataOptions.vcsConnector = undefined;

        const newMetadata = await getVCSMetadata(metaDataOptions, fileContent);

        expect(newMetadata).toEqual(expectedMetadata);
    });

    test(
        'returns new metadata with filled contributors ' +
            'when metadata options has "isContributorsEnabled" and "vcsConnector"',
        async () => {
            const fileContent = '';
            const expectedMetadata = {
                contributors: contributorsArray,
            };

            const newMetadata = await getVCSMetadata(metaDataOptions, fileContent);

            expect(newMetadata).toEqual(expectedMetadata);
        },
    );

    test(
        'returns updated metadata with empty contributors when file has default metadata ' +
            'and metadata options has "vcsConnector" and do not have "isContributorsEnabled"',
        async () => {
            const fileContent = '';
            const meta: Metadata = {
                title: 'Some title',
            };
            const expectedMetadata = {
                ...meta,
                contributors: [],
                author: null,
            };
            metaDataOptions.isContributorsEnabled = false;

            const newMetadata = await getVCSMetadata(metaDataOptions, fileContent, meta);

            expect(newMetadata).toEqual(expectedMetadata);
        },
    );

    test(
        'returns updated metadata with empty contributors when file has metadata with author ' +
            'and metadata options has "vcsConnector" and do not have "isContributorsEnabled"',
        async () => {
            const fileContent = '';
            const meta: Metadata = {
                title: 'Some title',
                author: 'Some author',
            };
            const expectedMetadata = {
                ...meta,
                contributors: [],
                author: authorString,
            };
            metaDataOptions.isContributorsEnabled = false;

            const newMetadata = await getVCSMetadata(metaDataOptions, fileContent, meta);

            expect(newMetadata).toEqual(expectedMetadata);
        },
    );

    test(
        'returns updated metadata with empty contributors when file has metadata with author ' +
            'and metadata options do not have "isContributorsEnabled" and "vcsConnector"',
        async () => {
            const fileContent = '';
            const meta: Metadata = {
                title: 'Some title',
                author: 'Some author',
            };
            const expectedMetadata = {
                ...meta,
                contributors: [],
                author: null,
            };
            metaDataOptions.isContributorsEnabled = false;
            metaDataOptions.vcsConnector = undefined;

            const newMetadata = await getVCSMetadata(metaDataOptions, fileContent, meta);

            expect(newMetadata).toEqual(expectedMetadata);
        },
    );
});
