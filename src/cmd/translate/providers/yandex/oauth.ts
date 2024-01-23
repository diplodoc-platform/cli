import {readFile} from 'fs/promises';
import {existsSync} from 'fs';
import {env} from 'process';
import {homedir} from 'os';
import {join} from 'path';

const YANDEX_OAUTH_TOKEN_FILENAME = '.ya_oauth_token';

export async function getYandexOAuthToken() {
    const {YANDEX_OAUTH_TOKEN} = env;

    return YANDEX_OAUTH_TOKEN ?? (await getYandexOAuthTokenFromHomeDir());
}

async function getYandexOAuthTokenFromHomeDir() {
    const path = join(homedir(), YANDEX_OAUTH_TOKEN_FILENAME);

    const isFileExists = existsSync(path);

    if (!isFileExists) {
        throw new Error(`OAuth token file ${path} not found`);
    }

    const token = (await readFile(path, {encoding: 'utf8'})).trim();

    if (!token?.length) {
        throw new Error(`OAuth token content in ${path} is empty`);
    }

    return token;
}
