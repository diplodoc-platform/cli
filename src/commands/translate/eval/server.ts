import type {AddressInfo} from 'node:net';
import type {ChatRequestMessage, TmLookup} from './mock';
import type {Server} from 'node:http';

import {createServer} from 'node:http';

import {
    FRAGMENT_SEPARATOR,
    buildJudgeResponse,
    buildTranslateResponse,
    isJudgeRequest,
    parseCaptureRequest,
} from './mock';

type ChatHandler = (messages: ChatRequestMessage[]) => string;

type BaseServer = {
    /** Base URL to pass as `--api-base`, ends with `/v1`. */
    apiBase: string;
    close(): Promise<void>;
};

/**
 * Starts a local OpenAI-compatible chat completions endpoint driven by
 * the given handler. No network access involved.
 */
function startChatServer(handler: ChatHandler): Promise<BaseServer> {
    const server = createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk;
        });
        req.on('end', () => {
            let text: string;
            try {
                const data = JSON.parse(body) as {messages: ChatRequestMessage[]};
                text = handler(data.messages);
            } catch (error) {
                res.statusCode = 400;
                res.end(JSON.stringify({error: {message: String(error)}}));
                return;
            }

            res.setHeader('content-type', 'application/json');
            res.end(
                JSON.stringify({
                    choices: [
                        {
                            message: {role: 'assistant', content: text},
                            finish_reason: 'stop',
                        },
                    ],
                    usage: {prompt_tokens: 0, completion_tokens: 0},
                }),
            );
        });
    });

    return new Promise((resolve, reject) => {
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const {port} = server.address() as AddressInfo;
            resolve({
                apiBase: `http://127.0.0.1:${port}/v1`,
                close: () => closeServer(server),
            });
        });
    });
}

function closeServer(server: Server): Promise<void> {
    return new Promise((done, fail) => {
        server.close((error) => (error ? fail(error) : done()));
    });
}

export type CaptureServer = BaseServer & {
    /** Units per file, in request order. */
    units: Map<string, string[]>;
};

/**
 * Starts an echo endpoint for a capture run: fragments are returned
 * unchanged and recorded per file, once each. Requires the translate
 * run to use `CAPTURE_USER_PROMPT` and `--max-concurrency 1` so that
 * the request order matches the document order.
 *
 * Deduplication matters because an echoed fragment is indistinguishable
 * from a refused translation (byte-identical output still carrying
 * source-script text), so `retryUntranslated` re-requests the fragments
 * of a batch exactly once, right after that batch (the capture run is
 * sequential, so a retry never arrives later). Without dedup that
 * repeat would be recorded as a second, distinct unit and double the
 * file's unit count.
 *
 * The dedup only looks at the previous request for a file, not its
 * whole history: `translate()` caches by unit text for the run, so it
 * never asks for the same unit twice on its own, and a fragment that
 * legitimately recurs in a later batch must still be recorded, or the
 * positional pairing in `buildTranslationMemory` would silently
 * mispair units.
 */
export async function startCaptureServer(): Promise<CaptureServer> {
    const units = new Map<string, string[]>();
    const previous = new Map<string, Set<string>>();

    const server = await startChatServer((messages) => {
        const user = messages[messages.length - 1].content;
        const request = parseCaptureRequest(user);

        const skip = previous.get(request.file);
        const fresh = skip
            ? request.fragments.filter((fragment) => !skip.has(fragment))
            : request.fragments;

        previous.set(request.file, new Set(request.fragments));
        units.set(request.file, (units.get(request.file) || []).concat(fresh));

        return request.fragments.join(`\n${FRAGMENT_SEPARATOR}\n`);
    });

    return {...server, units};
}

export type MockServerStats = {
    translateRequests: number;
    judgeRequests: number;
    misses: string[];
};

export type MockServer = BaseServer & {
    stats: MockServerStats;
};

/**
 * Starts the main mock endpoint: translates via the reference
 * translation memory and answers judge requests with deterministic
 * scores.
 */
export async function startMockServer(lookup: TmLookup): Promise<MockServer> {
    const stats: MockServerStats = {
        translateRequests: 0,
        judgeRequests: 0,
        misses: [],
    };

    const server = await startChatServer((messages) => {
        const user = messages[messages.length - 1].content;

        if (isJudgeRequest(messages)) {
            stats.judgeRequests++;
            return buildJudgeResponse(user, lookup);
        }

        stats.translateRequests++;
        const result = buildTranslateResponse(user, lookup);
        stats.misses.push(...result.misses);
        return result.text;
    });

    return {...server, stats};
}
