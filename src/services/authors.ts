import { VCSConnector } from '../vcs-connector/models';

async function getUpdatedAuthorString(vcsConnector: VCSConnector, defaultMetadata = ''): Promise<string> {
    // Include example: author: authorLogin
    // Regexp result: authorLogin
    const regexpAuthor = /(?<=author:\s).+(?=\\r\\n)/g;
    const matchAuthor = defaultMetadata.match(regexpAuthor);

    if (matchAuthor && matchAuthor?.length > 0) {
        const authorLogin = matchAuthor[0];
        const user = await vcsConnector.getUserByLogin(authorLogin);

        if (user) {
            return defaultMetadata.replace(authorLogin, JSON.stringify(user));
        }
    }

    return defaultMetadata;
}

async function getAuthorDetails(vcsConnector: VCSConnector, authorLogin: string): Promise<string | null> {
    const user = await vcsConnector.getUserByLogin(authorLogin);

    if (user) {
        return JSON.stringify(user);
    }

    return null;
}

export {
    getUpdatedAuthorString,
    getAuthorDetails,
};
