import {AxiosError} from 'axios';

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

    /** Server-suggested pause in seconds (Retry-After header). */
    retryAfter?: number;

    constructor(message: string, retryAfter?: number) {
        super(message, 'LLM_RATE_LIMIT');
        this.retryAfter = retryAfter;
    }
}

export class LLMResponseError extends TranslateError {
    retryable: boolean;

    constructor(message: string, retryable = true) {
        super(message, 'LLM_RESPONSE_ERROR');
        this.retryable = retryable;
    }
}

/**
 * Maps an axios error to the corresponding LLM error.
 * Rethrows unknown errors as is.
 */
export function throwLLMError(error: unknown, provider: string): never {
    if (error instanceof AxiosError) {
        const {response} = error;

        if (response) {
            const {status, statusText, data} = response;
            const message = data?.error?.message || data?.message || statusText;

            if (status === 401 || status === 403) {
                throw new LLMAuthError(`${provider} auth failed: ${message}`);
            }
            if (status === 429) {
                const retryAfter = Number(response.headers?.['retry-after']);
                throw new LLMRateLimitError(
                    message,
                    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
                );
            }
            throw new LLMRequestError(status, message, {
                retryable: status >= 500 && status < 600,
            });
        }

        // No response received (timeout, connection reset) - worth retrying.
        throw new LLMRequestError(0, error.message, {retryable: true});
    }

    throw error;
}
