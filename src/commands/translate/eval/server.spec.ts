import {afterEach, describe, expect, it} from 'vitest';

import {buildJudgeMessages} from '../providers/ai/judge';
import {buildMessages} from '../providers/ai/prompts';

import {CAPTURE_USER_PROMPT, makeTmLookup} from './mock';
import {startCaptureServer, startMockServer} from './server';

type ChatMessage = {role: string; content: string};

async function complete(apiBase: string, messages: ChatMessage[]): Promise<string> {
    const response = await fetch(`${apiBase}/chat/completions`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({model: 'eval-test', messages}),
    });

    const data = (await response.json()) as {choices: {message: {content: string}}[]};
    return data.choices[0].message.content;
}

describe('translate eval mock servers', () => {
    const cleanups: (() => Promise<void>)[] = [];

    afterEach(async () => {
        while (cleanups.length) {
            await cleanups.pop()?.();
        }
    });

    it('should record and echo units in capture mode', async () => {
        const server = await startCaptureServer();
        cleanups.push(server.close);

        const fragments = ['Первый юнит.', 'Второй юнит.'];
        const messages = buildMessages(fragments, {
            promptMode: 'append',
            sourceLanguage: 'ru-RU',
            targetLanguage: 'en-US',
            glossaryPairs: [],
            context: 'document "Тест" (file ru/a.md)',
            userPrompt: CAPTURE_USER_PROMPT,
        });

        const text = await complete(server.apiBase, messages);

        expect(server.units.get('ru/a.md')).toEqual(fragments);
        expect(text).toContain('Первый юнит.');
        expect(text).toContain('Второй юнит.');
    });

    it('should translate through the memory and count misses', async () => {
        const lookup = makeTmLookup(new Map([['Первый юнит.', 'First unit.']]));
        const server = await startMockServer(lookup);
        cleanups.push(server.close);

        const messages = buildMessages(['Первый юнит.'], {
            promptMode: 'append',
            sourceLanguage: 'ru-RU',
            targetLanguage: 'en-US',
            glossaryPairs: [],
            context: 'document "Тест" (file ru/a.md)',
        });

        const text = await complete(server.apiBase, messages);

        expect(text).toBe('First unit.');
        expect(server.stats.translateRequests).toBe(1);
        expect(server.stats.judgeRequests).toBe(0);
        expect(server.stats.misses).toEqual([]);
    });

    it('should answer judge requests with scores', async () => {
        const lookup = makeTmLookup(new Map([['Один', 'One']]));
        const server = await startMockServer(lookup);
        cleanups.push(server.close);

        const messages = buildJudgeMessages(
            [{path: 'a.md', source: 'Один', translation: 'One'}],
            'ru',
            'en',
        );

        const text = await complete(server.apiBase, messages);

        expect(JSON.parse(text)).toEqual([{index: 1, score: 100, issue: ''}]);
        expect(server.stats.judgeRequests).toBe(1);
    });

    it('should reject a malformed request body', async () => {
        const server = await startMockServer(makeTmLookup(new Map()));
        cleanups.push(server.close);

        const response = await fetch(`${server.apiBase}/chat/completions`, {
            method: 'POST',
            body: 'not json',
        });

        expect(response.status).toBe(400);
    });
});
