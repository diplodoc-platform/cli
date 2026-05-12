import {TranslateError} from '../../../utils';

export class LLMRequestError extends TranslateError {
    status: number;

    retryable: boolean;

    constructor(
        status: number,
        message: string,
        info: {fatal?: boolean; retryable?: boolean} = {},
    ) {
        super(message, 'LLM_REQUEST_ERROR', info.fatal);
        this.status = status;
        this.retryable = info.retryable ?? false;
    }
}

export class LLMAuthError extends TranslateError {
    constructor(message: string) {
        super(message, 'LLM_AUTH_ERROR', true);
    }
}

export class LLMRateLimitError extends TranslateError {
    retryable = true;

    constructor(message: string) {
        super(message, 'LLM_RATE_LIMIT');
    }
}

export class LLMResponseError extends TranslateError {
    retryable: boolean;

    constructor(message: string, retryable = true) {
        super(message, 'LLM_RESPONSE_ERROR');
        this.retryable = retryable;
    }
}
