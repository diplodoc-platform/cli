import {afterEach, describe, expect, it, vi} from 'vitest';

import {createChatClient} from './chat';

const response = (content: string) =>
    new Response(JSON.stringify({choices: [{message: {content}}]}), {
        status: 200,
        headers: {'content-type': 'application/json'},
    });

const client = (over: {retry?: number; retryDelayMs?: number} = {}) =>
    createChatClient({
        apiBase: 'https://judge/v1',
        auth: 'secret',
        model: 'judge-model',
        ...over,
    });

afterEach(() => {
    vi.restoreAllMocks();
});

describe('createChatClient', () => {
    it('should post to the chat completions path with bearer auth', async () => {
        const fetchMock = vi.fn().mockResolvedValue(response('answer'));
        vi.stubGlobal('fetch', fetchMock);

        await expect(client().complete('system', 'user')).resolves.toBe('answer');

        const [url, init] = fetchMock.mock.calls[0];

        expect(url).toBe('https://judge/v1/chat/completions');
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret');

        const body = JSON.parse(init.body as string);

        expect(body.model).toBe('judge-model');
        expect(body.temperature).toBe(0);
        expect(body.messages).toEqual([
            {role: 'system', content: 'system'},
            {role: 'user', content: 'user'},
        ]);
    });

    it('should retry a rate-limited request', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response('slow down', {status: 429}))
            .mockResolvedValueOnce(response('answer'));
        vi.stubGlobal('fetch', fetchMock);

        await expect(client({retry: 2, retryDelayMs: 0}).complete('system', 'user')).resolves.toBe(
            'answer',
        );
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should give up after the retry budget and report the status', async () => {
        // A fresh Response per call: a body can only be read once.
        const fetchMock = vi
            .fn()
            .mockImplementation(async () => new Response('boom', {status: 500}));
        vi.stubGlobal('fetch', fetchMock);

        await expect(
            client({retry: 2, retryDelayMs: 0}).complete('system', 'user'),
        ).rejects.toThrow(/500/);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should not retry a bad request', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('nope', {status: 400}));
        vi.stubGlobal('fetch', fetchMock);

        await expect(
            client({retry: 3, retryDelayMs: 0}).complete('system', 'user'),
        ).rejects.toThrow(/400/);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
