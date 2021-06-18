import {VCSConnector} from '../vcs-connector/connector-models';

async function updateAuthorMetadataString(defaultMetadata = '', vcsConnector?: VCSConnector): Promise<string> {
    if (!vcsConnector) {
        return defaultMetadata;
    }

    // Include example: author: authorLogin
    // Regexp result: authorLogin
    const regexpAuthor = /(?<=author:\s).+(?=\r?\n)/g;
    const matchAuthor = defaultMetadata.match(regexpAuthor);

    if (matchAuthor && matchAuthor?.length > 0) {
        const authorLogin = matchAuthor[0];
        const user = await getAuthorDetails(vcsConnector, authorLogin);

        if (user) {
            return defaultMetadata.replace(authorLogin, user);
        }
    }

    return defaultMetadata;
}

async function getAuthorDetails(vcsConnector: VCSConnector, authorLogin: string): Promise<string | null> {
    const user = await vcsConnector.getUserByLogin(authorLogin);

    if (user) {
        return JSON.stringify(user).replace(/"/g, '\'');
    }

    return null;
}

export {
    updateAuthorMetadataString,
    getAuthorDetails,
};
