import {cyan, gray} from 'chalk';
import {option, trim} from '~/config';

const folderId = option({
    flags: '--folder-id <value>',
    desc: `
        ID of the folder to which you have access.
        Required for authorization with a user account (see https://cloud.yandex.ru/ru/docs/iam/api-ref/UserAccount/#representation).
        Don't specify this field if you make the request on behalf of a service account.
    `,
});

const configExample = trim(
    gray(`
glossaryPairs:
  - sourceText: string
    translatedText: string
  - sourceText: string
    translatedText: string`),
);

const glossary = option({
    flags: '--glossary <path>',
    desc: `
        Path to yaml file with glossary translation pairs.
        (See more ${cyan('https://cloud.yandex.ru/en-ru/docs/translate/concepts/glossary')})

        Config example:
        ${configExample}`,
});

const oauthToken = option({
    flags: '--oauth-token <value>',
    desc: `
        Authorization token for Translation API.
        (See more ${cyan('https://cloud.yandex.ru/en-ru/docs/translate/api-ref/authentication')}
    `,
});

export const options = {
    folderId,
    glossary,
    oauthToken,
};
