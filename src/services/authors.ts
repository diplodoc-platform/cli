import {replaceDoubleToSingleQuotes} from '../utils';
import {VCSConnector} from '../vcs-connector/connector-models';

async function updateAuthorMetadataStringByAuthorLogin(
    authorLogin: string,
    vcsConnector?: VCSConnector,
): Promise<string> {
    if (!vcsConnector) {
        return '';
    }

    const user = await getAuthorDetails(vcsConnector, authorLogin);

    if (user) {
        return user;
    }

    return '';
}

async function updateAuthorMetadataStringByFilePath(
    filePath: string,
    vcsConnector?: VCSConnector,
): Promise<string> {
    if (!vcsConnector) {
        return '';
    }

    const user = vcsConnector.getExternalAuthorByPath(filePath);

    if (user) {
        const author = replaceDoubleToSingleQuotes(JSON.stringify(user));
        return author;
    }

    return '';
}

async function getAuthorDetails(
    vcsConnector: VCSConnector,
    author: string | object,
): Promise<string | null> {
    if (typeof author === 'object') {
        // Avoiding problems when adding to html markup
        return replaceDoubleToSingleQuotes(JSON.stringify(author));
    }

    try {
        JSON.parse(author);
        return replaceDoubleToSingleQuotes(author);
    } catch {
        const user = await vcsConnector.getUserByLogin(author);

        if (user) {
            return replaceDoubleToSingleQuotes(JSON.stringify(user));
        }

        return null;
    }
}

export {
    updateAuthorMetadataStringByAuthorLogin,
    updateAuthorMetadataStringByFilePath,
    getAuthorDetails,
};
