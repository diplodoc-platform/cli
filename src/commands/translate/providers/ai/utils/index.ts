import {randomInt} from 'node:crypto';

export {
    LLMRequestError,
    LLMAuthError,
    LLMRateLimitError,
    LLMResponseError,
    throwLLMError,
} from './errors';

export class Defer<T = string> {
    resolve!: (text: T) => void;

    reject!: (error: unknown) => void;

    promise: Promise<T>;

    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }
}

export function bytes(texts: string[]) {
    return texts.reduce((sum, text) => sum + text.length, 0);
}

// Rough heuristic for budgeting and dry-run: ~4 chars per token for
// latin text, ~2 for the rest (Cyrillic and CJK tokenize much denser).
export function estimateTokens(text: string) {
    let ascii = 0;
    for (let i = 0; i < text.length; i++) {
        if ((text.codePointAt(i) ?? 0) < 128) {
            ascii++;
        }
    }
    const other = text.length - ascii;

    return Math.ceil(ascii / 4 + other / 2);
}

export async function wait(interval: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, interval));
}

export async function backoff<T>(action: () => Promise<T>, retries: number): Promise<T> {
    const attempts = Math.max(0, retries) + 1;

    for (let attempt = 0; ; attempt++) {
        try {
            return await action();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            if (!canRetry(error) || attempt >= attempts - 1) {
                throw error;
            }
            await wait(retryInterval(error, attempt));
        }
    }
}

// Respects the server-provided Retry-After when available, otherwise
// exponential backoff with jitter to avoid synchronized retries.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function retryInterval(error: any, attempt: number): number {
    if (error?.retryAfter > 0) {
        return error.retryAfter * 1000;
    }

    return Math.pow(2, attempt) * 1000 * (1 + randomInt(0, 1000) / 1000);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function canRetry(error: any) {
    if (error?.retryable === true) {
        return true;
    }
    const status = error?.status;
    return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}
