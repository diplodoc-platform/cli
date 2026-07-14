import {describe, expect, it} from 'vitest';

import {DEFAULT_SYSTEM_PROMPT, FRAGMENT_SEPARATOR, buildMessages, splitFragments} from './prompts';

const config = {
    promptMode: 'append' as const,
    sourceLanguage: 'ru',
    targetLanguage: 'en',
    glossaryPairs: [],
};

describe('translate ai prompts', () => {
    describe('splitFragments', () => {
        it('should split response by delimiter', () => {
            const text = `One\n${FRAGMENT_SEPARATOR}\nTwo\n${FRAGMENT_SEPARATOR}\nThree`;

            expect(splitFragments(text)).toEqual(['One', 'Two', 'Three']);
        });

        it('should tolerate extra whitespace around delimiter', () => {
            const text = `One \n\n ${FRAGMENT_SEPARATOR} \n\n Two`;

            expect(splitFragments(text)).toEqual(['One', 'Two']);
        });

        it('should return single fragment when delimiter is absent', () => {
            expect(splitFragments('Just one')).toEqual(['Just one']);
        });
    });

    describe('buildMessages', () => {
        it('should build system and user messages with substituted placeholders', () => {
            const [system, user] = buildMessages(['Hello'], config);

            expect(system.role).toBe('system');
            expect(system.content).toContain('from ru into en');
            expect(user.role).toBe('user');
            expect(user.content).toContain('Hello');
            expect(user.content).toContain(FRAGMENT_SEPARATOR);
        });

        it('should append custom system prompt to the default one', () => {
            const [system] = buildMessages(['Hello'], {
                ...config,
                systemPrompt: 'Prefer formal tone.',
            });

            expect(system.content).toContain('professional technical documentation translator');
            expect(system.content).toContain('Prefer formal tone.');
        });

        it('should replace the default system prompt in replace mode', () => {
            const [system] = buildMessages(['Hello'], {
                ...config,
                systemPrompt: 'Custom only.',
                promptMode: 'replace',
            });

            expect(system.content).toBe('Custom only.');
        });

        it('should fall back to the default system prompt in replace mode without custom prompt', () => {
            const [system] = buildMessages(['Hello'], {
                ...config,
                promptMode: 'replace',
            });

            expect(system.content).not.toContain('{{source}}');
            expect(system.content).toContain(DEFAULT_SYSTEM_PROMPT.split('\n')[0]);
        });

        it('should render glossary pairs into the user message', () => {
            const [, user] = buildMessages(['Hello'], {
                ...config,
                glossaryPairs: [{sourceText: 'облако', translatedText: 'cloud'}],
            });

            expect(user.content).toContain('облако');
            expect(user.content).toContain('cloud');
        });

        it('should join fragments with the delimiter', () => {
            const [, user] = buildMessages(['One', 'Two'], config);

            expect(user.content).toContain(`One\n${FRAGMENT_SEPARATOR}\nTwo`);
        });

        it('should not substitute placeholders inside fragment content', () => {
            const [, user] = buildMessages(['Value of {{source}} var'], config);

            expect(user.content).toContain('Value of {{source}} var');
        });
    });
});
