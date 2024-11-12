import {TranslateError} from '../../../utils';

export class RequestError extends TranslateError {
    static canRetry(error: unknown) {
        if (error instanceof RequestError) {
            switch (true) {
                case error.status === 429:
                    return true;
                case error.status === 500:
                    return true;
                case error.status === 503:
                    return true;
                case error.status === 504:
                    return true;
                default:
                    return false;
            }
        }

        return false;
    }

    status: number;

    constructor(
        status: number,
        statusText: string,
        info: {code?: number; message?: string; fatal?: boolean} = {},
    ) {
        super(`${statusText}\n${info.message || ''}`, 'REQUEST_ERROR', info.fatal);

        this.status = status;
    }
}

const INACTIVE_CLOUD = /^The cloud .*? is inactive/;
const WRONG_APIKEY = /^Unknown api key/;
const WRONG_TOKEN = /^The token is invalid/;
const EXPIRED_TOKEN = /^The token has expired/;

export class AuthError extends TranslateError {
    static is(message: string) {
        return Boolean(AuthError.reason(message));
    }

    static reason(message: string) {
        switch (true) {
            case INACTIVE_CLOUD.test(message):
                return 'INACTIVE_CLOUD';
            case WRONG_APIKEY.test(message):
                return 'WRONG_APIKEY';
            case WRONG_TOKEN.test(message):
                return 'WRONG_TOKEN';
            case EXPIRED_TOKEN.test(message):
                return 'EXPIRED_TOKEN';
            default:
                return null;
        }
    }

    constructor(message: string) {
        super(message, AuthError.reason(message) || 'AUTH_ERROR', true);
    }
}

const LIMIT_EXCEED_RX = /^limit on units was exceeded. (.*)$/;

export class LimitExceed extends TranslateError {
    static is(message: string) {
        return Boolean(LIMIT_EXCEED_RX.test(message));
    }

    constructor(message: string) {
        const [, desc] = LIMIT_EXCEED_RX.exec(message) || [];
        super(desc, 'TRANSLATE_LIMIT_EXCEED', true);
    }
}
