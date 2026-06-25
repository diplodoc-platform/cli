import {existsSync, readFileSync} from 'node:fs';

const YANDEX_BEARER_PREFIXES = ['y0_', 't1.'];
const YANDEX_API_KEY_PREFIX = 'AQVN';

/**
 * Resolves an auth token from a CLI value.
 * The value may be either the raw token or a path to a file containing the token.
 */
export function resolveToken(value: string): string {
    if (!value) {
        throw new Error('No auth token provided');
    }

    const trimmed = value.trim();

    if (existsSync(trimmed)) {
        return readFileSync(trimmed, 'utf8').trim();
    }

    return trimmed;
}

/**
 * Builds an Authorization header value for Yandex AI Studio.
 * Supports IAM/OAuth tokens (Bearer) and service-account API keys (Api-Key).
 */
export function yandexAuthHeader(token: string): string {
    for (const prefix of YANDEX_BEARER_PREFIXES) {
        if (token.startsWith(prefix)) {
            return 'Bearer ' + token;
        }
    }

    if (token.startsWith(YANDEX_API_KEY_PREFIX)) {
        return 'Api-Key ' + token;
    }

    return 'Api-Key ' + token;
}
