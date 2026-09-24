import type {AddressInfo} from 'node:net';
import type {Server} from 'node:http';

import {createServer} from 'node:http';

// Must match FRAGMENT_SEPARATOR of the AI provider (src/commands/translate/providers/ai/prompts.ts).
export const FRAGMENT_SEPARATOR = '<<<§§§>>>';

// Context line first, then bare fragments, so the mock recovers them exactly.
export const MOCK_USER_PROMPT = '{{context}}\n{{fragments}}';

export type MockModel = {
    /** Base URL to pass as `--api-base`, ends with `/v1`. */
    apiBase: string;
    /** Fragments the dictionary had no translation for, in request order. */
    misses: string[];
    close(): Promise<void>;
};

function listen(server: Server): Promise<void> {
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            server.off('error', reject);
            resolve();
        });
    });
}

/**
 * Local OpenAI-compatible chat endpoint that translates fragments by a dictionary
 * and echoes the unknown ones, recording them as misses. The translate run must
 * use MOCK_USER_PROMPT so that the request carries nothing but the fragments.
 */
export async function startMockModel(dictionary: Record<string, string>): Promise<MockModel> {
    const misses: string[] = [];
    const server = createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk;
        });
        req.on('end', () => {
            let content: string;
            try {
                const {messages} = JSON.parse(body) as {messages: {content: string}[]};
                const user = messages[messages.length - 1].content;
                const fragments = user
                    .slice(user.indexOf('\n') + 1)
                    .split(`\n${FRAGMENT_SEPARATOR}\n`);
                const translated = fragments.map((fragment) => {
                    if (!(fragment in dictionary)) {
                        misses.push(fragment);
                    }

                    return dictionary[fragment] ?? fragment;
                });

                content = translated.join(`\n${FRAGMENT_SEPARATOR}\n`);
            } catch (error) {
                res.statusCode = 400;
                res.end(JSON.stringify({error: {message: String(error)}}));
                return;
            }

            res.setHeader('content-type', 'application/json');
            res.end(
                JSON.stringify({
                    choices: [{message: {role: 'assistant', content}, finish_reason: 'stop'}],
                    usage: {prompt_tokens: 0, completion_tokens: 0},
                }),
            );
        });
    });

    await listen(server);

    const {port} = server.address() as AddressInfo;

    return {
        apiBase: `http://127.0.0.1:${port}/v1`,
        misses,
        close: () =>
            new Promise<void>((resolve, reject) =>
                server.close((error) => (error ? reject(error) : resolve())),
            ),
    };
}
