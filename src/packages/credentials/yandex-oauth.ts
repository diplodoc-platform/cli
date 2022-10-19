import {readFile} from 'fs/promises';
import {env} from 'process';
import {homedir} from 'os';
import {join} from 'path';

import {logger} from '../../utils';

const YANDEX_OAUTH_TOKEN_FILENAME = '.ya_oauth_token';

async function getYandexOAuthToken() {
    const {YANDEX_OAUTH_TOKEN} = env;

    return YANDEX_OAUTH_TOKEN ?? getYandexOAuthTokenFromHomeDir();
}

async function getYandexOAuthTokenFromHomeDir() {
    const error = 'failed reading yandex oauth token';

    const path = join(homedir(), YANDEX_OAUTH_TOKEN_FILENAME);

    let token;

    try {
        token = await readFile(path, {encoding: 'utf8'});

        token = token.trim();

        if (!token?.length) {
            throw new Error(error);
        }
    } catch (err) {
        logger.error(error);

        throw err;
    }

    return token;
}

export {getYandexOAuthToken};

export default {getYandexOAuthToken};
