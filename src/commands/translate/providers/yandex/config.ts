import {cyan, gray} from 'chalk';
import {option, trim} from '~/config';

const folder = option({
    flags: '--folder <value>',
    desc: `
        ID of the folder to which you have access.
        Required for authorization with a user account (see https://cloud.yandex.ru/ru/docs/iam/api-ref/UserAccount/#representation).
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

const auth = option({
    flags: '--auth <value>',
    desc: `
        Authorization token for Translation API.
        (See more ${cyan('https://cloud.yandex.ru/en-ru/docs/translate/api-ref/authentication')}
    `,
});

export const options = {
    folder,
    glossary,
    auth,
};
