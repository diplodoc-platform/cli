import {readFileSync} from 'fs';

const resolveKey = (data: string) => {
    switch (true) {
        case data.startsWith('y0_'):
            return 'Bearer ' + data;
        case data.startsWith('t1.'):
            return 'Bearer ' + data;
        case data.startsWith('AQVN'):
            return 'Api-Key ' + data;
        default:
            return null;
    }
};

export function getYandexAuth(path: string) {
    let auth = resolveKey(path);

    if (auth !== null) {
        return auth;
    }

    auth = resolveKey(readFileSync(path, 'utf8'));

    if (auth === null) {
        throw new Error('No Auth');
    }

    return auth;
}
