import * as units from 'utils/markup';
import {
    getAuthorDetails,
    updateAuthorMetadataStringByAuthorLogin,
    updateAuthorMetadataStringByFilePath,
} from 'services/authors';
import {VCSConnector} from 'vcs-connector/connector-models';
import {Contributor} from 'models';

const filepath = 'index.md';

const author = {
    avatar: 'https://example.ru/logo.png',
    name: 'Name Surname',
    url: 'https://example.ru',
    email: 'alias@yandex.ru',
    login: 'alias',
};

const authorByPath: Map<string, Contributor | null> = new Map();

const defaultVCSConnector: VCSConnector = {
    addNestedContributorsForPath: () => { },
    getContributorsByPath: () => Promise.resolve(null),
    getUserByLogin: () => Promise.resolve(author),
    getExternalAuthorByPath: (path) => authorByPath.get(path),
    getModifiedTimeByPath: () => undefined,
};

describe('getAuthorDetails returns author details', () => {
    let spyReplaceDoubleToSingleQuotes: jest.SpyInstance;

    beforeAll(() => {
        spyReplaceDoubleToSingleQuotes = jest.spyOn(
            units,
            'replaceDoubleToSingleQuotes'
        );
    });

    beforeEach(() => {
        spyReplaceDoubleToSingleQuotes.mockClear();
    });

    afterEach(() => {
        expect(spyReplaceDoubleToSingleQuotes).toHaveBeenCalled();
        expect(spyReplaceDoubleToSingleQuotes).toHaveBeenCalledTimes(2);
    });

    afterAll(() => {
        jest.clearAllMocks();
    });

    test('when author is object', async () => {
        const expectedAuthorDetails = units.replaceDoubleToSingleQuotes(
            JSON.stringify(author)
        );

        const authorDetails = await getAuthorDetails(
            defaultVCSConnector,
            author
        );

        expect(authorDetails).toEqual(expectedAuthorDetails);
    });

    test('when author is stringified object', async () => {
        const stringifiedObject = JSON.stringify(author);
        const expectedAuthorDetails =
            units.replaceDoubleToSingleQuotes(stringifiedObject);

        const authorDetails = await getAuthorDetails(
            defaultVCSConnector,
            stringifiedObject
        );

        expect(authorDetails).toEqual(expectedAuthorDetails);
    });

    test('when author is alias and "getUserByLogin" returns author data by alias', async () => {
        const expectedAuthorDetails = units.replaceDoubleToSingleQuotes(
            JSON.stringify(author)
        );

        const authorDetails = await getAuthorDetails(
            defaultVCSConnector,
            author.login
        );

        expect(authorDetails).toEqual(expectedAuthorDetails);
    });
});

describe('getAuthorDetails does not return author details', () => {
    afterAll(() => {
        jest.clearAllMocks();
    });

    test('when author is alias and "getUserByLogin" does not return author data by alias', async () => {
        const expectedAuthorDetails = null;
        const vcsConnector = {
            ...defaultVCSConnector,
            getUserByLogin: () => Promise.resolve(null),
        };
        const spyReplaceDoubleToSingleQuotes = jest.spyOn(
            units,
            'replaceDoubleToSingleQuotes'
        );

        const authorDetails = await getAuthorDetails(
            vcsConnector,
            author.login
        );

        expect(authorDetails).toEqual(expectedAuthorDetails);
        expect(spyReplaceDoubleToSingleQuotes).not.toHaveBeenCalled();
    });
});

describe('update author metadata by authorLogin', () => {
    afterAll(() => {
        jest.clearAllMocks();
    });

    test('returns empty strring when "vcsConnector" is undefined', async () => {
        const expectedMetadata = '';

        const updatedMetadata = await updateAuthorMetadataStringByAuthorLogin(
            author.login
        );

        expect(updatedMetadata).toEqual(expectedMetadata);
    });

    test('returns empty strring when "getUserByLogin" returns null', async () => {
        const expectedMetadata = '';
        const vcsConnector = {
            ...defaultVCSConnector,
            getUserByLogin: () => Promise.resolve(null),
        };

        const authorDetails = await updateAuthorMetadataStringByAuthorLogin(
            author.login,
            vcsConnector
        );

        expect(authorDetails).toEqual(expectedMetadata);
    });

    test('returns full author metadata', async () => {
        const expectedMetadata = units.replaceDoubleToSingleQuotes(
            JSON.stringify(author)
        );

        const updatedMetadata = await updateAuthorMetadataStringByAuthorLogin(
            author.login,
            defaultVCSConnector
        );

        expect(updatedMetadata).toEqual(expectedMetadata);
    });
});

describe('update author metadata by filePath', () => {
    beforeAll(() => {
        authorByPath.set(filepath, author);
    });

    afterAll(() => {
        jest.clearAllMocks();
    });

    test('returns empty strring when "vcsConnector" is undefined', async () => {
        const expectedMetadata = '';

        const updatedMetadata = await updateAuthorMetadataStringByFilePath(
            filepath
        );

        expect(updatedMetadata).toEqual(expectedMetadata);
    });

    test('returns empty strring when "getExternalAuthorByPath" returns null', async () => {
        const expectedMetadata = '';
        const vcsConnector = {
            ...defaultVCSConnector,
            getExternalAuthorByPath: () => null,
        };

        const authorDetails = await updateAuthorMetadataStringByFilePath(
            filepath,
            vcsConnector
        );

        expect(authorDetails).toEqual(expectedMetadata);
    });

    test('returns empty strring when there is no author for path', async () => {
        const expectedMetadata = '';
        const filepathWithoutAuthor = 'utils.md';

        const authorDetails = await updateAuthorMetadataStringByFilePath(
            filepathWithoutAuthor,
            defaultVCSConnector
        );

        expect(authorDetails).toEqual(expectedMetadata);
    });

    test('returns full author metadata', async () => {
        const expectedMetadata = units.replaceDoubleToSingleQuotes(
            JSON.stringify(author)
        );

        const updatedMetadata = await updateAuthorMetadataStringByFilePath(
            filepath,
            defaultVCSConnector
        );

        expect(updatedMetadata).toEqual(expectedMetadata);
    });
});
