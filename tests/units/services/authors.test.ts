import * as units from 'utils/markup';
import { REGEXP_AUTHOR } from '../../../src/constants';
import { getAuthorDetails, updateAuthorMetadataString } from 'services/authors';
import { VCSConnector } from 'vcs-connector/connector-models';

const author = {
    avatar: 'https://example.ru/logo.png',
    name: 'Name Surname',
    url: 'https://example.ru',
    email: 'alias@yandex.ru',
    login: 'alias',
};

const defaultVCSConnector: VCSConnector = {
    addNestedContributorsForPath: () => { },
    getContributorsByPath: () => Promise.resolve(null),
    getUserByLogin: () => Promise.resolve(null),
};

describe('getAuthorDetails returns author details', () => {
    let spyReplaceDoubleToSingleQuotes: jest.SpyInstance;

    beforeAll(() => {
        spyReplaceDoubleToSingleQuotes = jest.spyOn(units, 'replaceDoubleToSingleQuotes');
    });

    beforeEach(() => {
        spyReplaceDoubleToSingleQuotes.mockClear();
    });

    afterEach(() => {
        defaultVCSConnector.getUserByLogin = () => Promise.resolve(null);
        expect(spyReplaceDoubleToSingleQuotes).toHaveBeenCalled();
        expect(spyReplaceDoubleToSingleQuotes).toHaveBeenCalledTimes(2);
    });

    afterAll(() => {
        jest.clearAllMocks();
    });

    test('when author is object', async () => {
        const expectedAuthorDetails = units.replaceDoubleToSingleQuotes(JSON.stringify(author));

        const authorDetails = await getAuthorDetails(defaultVCSConnector, author);

        expect(authorDetails).toEqual(expectedAuthorDetails);
    });

    test('when author is stringified object', async () => {
        const stringifiedObject = JSON.stringify(author);
        const expectedAuthorDetails = units.replaceDoubleToSingleQuotes(stringifiedObject);

        const authorDetails = await getAuthorDetails(defaultVCSConnector, stringifiedObject);

        expect(authorDetails).toEqual(expectedAuthorDetails);
    });

    test('when author is alias and "getUserByLogin" returns author data by alias', async () => {
        const expectedAuthorDetails = units.replaceDoubleToSingleQuotes(JSON.stringify(author));
        defaultVCSConnector.getUserByLogin = () => Promise.resolve(author);

        const authorDetails = await getAuthorDetails(defaultVCSConnector, author.login);

        expect(authorDetails).toEqual(expectedAuthorDetails);
    });
});

describe('getAuthorDetails does not return author details', () => {
    afterAll(() => {
        jest.clearAllMocks();
    });

    test('when author is alias and "getUserByLogin" does not return author data by alias', async () => {
        const expectedAuthorDetails = null;
        defaultVCSConnector.getUserByLogin = () => Promise.resolve(null);
        const spyReplaceDoubleToSingleQuotes = jest.spyOn(units, 'replaceDoubleToSingleQuotes');

        const authorDetails = await getAuthorDetails(defaultVCSConnector, author.login);

        expect(authorDetails).toEqual(expectedAuthorDetails);
        expect(spyReplaceDoubleToSingleQuotes).not.toHaveBeenCalled();
    });
});

describe('updateAuthorMetadataString', () => {
    afterAll(() => {
        jest.clearAllMocks();
    });

    describe('should return default metadata', () => {
        test('when "vcsConnector" is undefined', async () => {
            const expectedMetadata = 'Some metadata';

            const updatedMetadata = await updateAuthorMetadataString(expectedMetadata);

            expect(updatedMetadata).toEqual(expectedMetadata);
        });

        test('when "defaultMetadata" is empty', async () => {
            const expectedMetadata = '';

            const authorDetails = await updateAuthorMetadataString(expectedMetadata, defaultVCSConnector);

            expect(authorDetails).toEqual(expectedMetadata);
        });

        test('when "getAuthorDetails" does not return author data', async () => {
            const expectedMetadata = `---
            author: alias
            ---`;

            defaultVCSConnector.getUserByLogin = () => Promise.resolve(null);

            const updatedMetadata = await updateAuthorMetadataString(expectedMetadata, defaultVCSConnector);

            expect(updatedMetadata).toEqual(expectedMetadata);
        });
    });

    describe('should return updated metadata', () => {
        test('when "getAuthorDetails" returns author data', async () => {
            const defaultMetadata = `---
            author: alias
            ---`;
            const authorDetails = units.replaceDoubleToSingleQuotes(JSON.stringify(author));
            defaultVCSConnector.getUserByLogin = () => Promise.resolve(author);

            const updatedMetadata = await updateAuthorMetadataString(defaultMetadata, defaultVCSConnector);

            const matchAuthor = defaultMetadata.match(REGEXP_AUTHOR);
            const expectedMetadata = defaultMetadata.replace(matchAuthor[0], authorDetails);

            expect(updatedMetadata).toEqual(expectedMetadata);
        });
    });
});
