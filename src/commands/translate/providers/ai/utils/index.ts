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

// Rough heuristic: ~4 chars per token. Good enough for budgeting and dry-run.
export function estimateTokens(text: string) {
    return Math.ceil(text.length / 4);
}

export function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
            await wait(Math.pow(2, attempt) * 1000);
        }
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function canRetry(error: any) {
    if (error?.retryable === true) {
        return true;
    }
    const status = error?.status;
    return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}
