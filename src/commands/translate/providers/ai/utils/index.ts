import {randomInt} from 'node:crypto';

export {
    LLMRequestError,
    LLMAuthError,
    LLMRateLimitError,
    LLMResponseError,
    throwLLMError,
} from './errors';
export {TranslationStore, cacheFingerprint} from './cache';

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

/**
 * Shared pause window for requests hitting the same endpoint. When one
 * request receives a 429, it pauses the gate and every request awaiting
 * the gate holds until the window elapses, instead of discovering the
 * limit on its own and burning its retry budget.
 */
export class RateGate {
    private until = 0;

    async wait() {
        // The deadline may be extended while we sleep, so re-check it.
        for (let delay = this.until - Date.now(); delay > 0; delay = this.until - Date.now()) {
            await wait(delay);
        }
    }

    pause(interval: number) {
        this.until = Math.max(this.until, Date.now() + interval);
    }
}

export type BackoffOptions = {
    /** Retry budget for rate limit errors. Defaults to `retries`. */
    rateLimitRetries?: number;
    /** Shared gate pausing sibling requests while a 429 window lasts. */
    gate?: RateGate;
};

type RetryBudget = {
    failures: number;
    rateLimitFailures: number;
    retries: number;
    rateLimitRetries: number;
    gate?: RateGate;
};

export async function backoff<T>(
    action: () => Promise<T>,
    retries: number,
    options: BackoffOptions = {},
): Promise<T> {
    const budget: RetryBudget = {
        failures: 0,
        rateLimitFailures: 0,
        retries: Math.max(0, retries),
        rateLimitRetries: Math.max(0, options.rateLimitRetries ?? retries),
        gate: options.gate,
    };

    for (;;) {
        await budget.gate?.wait();
        try {
            return await action();
        } catch (error) {
            await delayRetry(error, budget);
        }
    }
}

/**
 * Waits before the next attempt or rethrows when the budget is exhausted.
 * A rate limit pauses the shared gate instead of sleeping locally, so
 * sibling requests hold until the window elapses.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function delayRetry(error: any, budget: RetryBudget): Promise<void> {
    if (isRateLimit(error)) {
        if (budget.rateLimitFailures >= budget.rateLimitRetries) {
            throw error;
        }
        const interval = rateLimitInterval(error, budget.rateLimitFailures++);
        if (budget.gate) {
            budget.gate.pause(interval);
        } else {
            await wait(interval);
        }
        return;
    }

    if (!canRetry(error) || budget.failures >= budget.retries) {
        throw error;
    }
    await wait(retryInterval(error, budget.failures++));
}

// A 429 is transient by definition, so it gets a separate budget with
// longer waits: the server-provided Retry-After when available, otherwise
// exponential backoff with jitter capped at one minute per attempt.
const RATE_LIMIT_MAX_INTERVAL = 60_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rateLimitInterval(error: any, attempt: number): number {
    if (error?.retryAfter > 0) {
        return error.retryAfter * 1000;
    }

    return Math.min(retryInterval(error, attempt), RATE_LIMIT_MAX_INTERVAL);
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
function isRateLimit(error: any) {
    return error?.code === 'LLM_RATE_LIMIT' || error?.status === 429;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function canRetry(error: any) {
    if (error?.retryable === true) {
        return true;
    }
    const status = error?.status;
    return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}
