export type ChatClientConfig = {
    /** Base URL ending with `/v1`; `/chat/completions` is appended. */
    apiBase: string;
    auth: string;
    model: string;
    /** Total attempts per request, default 3. */
    retry?: number;
    /** Base backoff between attempts, default 2000 ms. */
    retryDelayMs?: number;
    /** Extra headers for internal gateways, "Name: value". */
    headers?: string[];
};

export type ChatClient = {
    complete(system: string, user: string): Promise<string>;
};

const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
    return new Promise((done) => setTimeout(done, ms));
}

function parseHeaders(headers: string[] | undefined): Record<string, string> {
    const result: Record<string, string> = {};

    for (const header of headers || []) {
        const separator = header.indexOf(':');

        if (separator > 0) {
            result[header.slice(0, separator).trim()] = header.slice(separator + 1).trim();
        }
    }

    return result;
}

/**
 * Minimal OpenAI-compatible chat client for the pairwise judge.
 *
 * The benchmark deliberately does not import the translate provider
 * runtime: the harness contract is to drive the CLI from the outside,
 * and the judge is the only place that has to talk to a model directly.
 */
export function createChatClient(config: ChatClientConfig): ChatClient {
    const attempts = config.retry ?? 3;
    const delay = config.retryDelayMs ?? 2000;
    const url = `${config.apiBase.replace(/\/$/, '')}/chat/completions`;

    return {
        async complete(system: string, user: string): Promise<string> {
            let lastError = '';

            for (let attempt = 1; attempt <= attempts; attempt++) {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        Authorization: `Bearer ${config.auth}`,
                        ...parseHeaders(config.headers),
                    },
                    body: JSON.stringify({
                        model: config.model,
                        temperature: 0,
                        messages: [
                            {role: 'system', content: system},
                            {role: 'user', content: user},
                        ],
                    }),
                });

                if (response.ok) {
                    const data = (await response.json()) as {
                        choices?: {message?: {content?: string}}[];
                    };

                    return data.choices?.[0]?.message?.content || '';
                }

                lastError = `${response.status} ${await response.text()}`;

                if (!RETRYABLE.has(response.status)) {
                    break;
                }

                if (attempt < attempts) {
                    await sleep(delay * attempt);
                }
            }

            throw new Error(`Judge request failed: ${lastError}`);
        },
    };
}
