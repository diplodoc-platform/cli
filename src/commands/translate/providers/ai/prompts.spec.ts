import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

import {
    DEFAULT_SYSTEM_PROMPT,
    FRAGMENT_SEPARATOR,
    buildMessages,
    resolveContextValue,
    splitFragments,
} from './prompts';

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

        it('should render document context into the user message', () => {
            const [, user] = buildMessages(['Hello'], {
                ...config,
                context: 'document "Quickstart" (file docs/ru/index.md)',
            });

            expect(user.content).toContain(
                'Document context: document "Quickstart" (file docs/ru/index.md).',
            );
        });

        it('should not render context prefix when context is absent', () => {
            const [, user] = buildMessages(['Hello'], config);

            expect(user.content).not.toContain('Document context');
        });

        it('should substitute context placeholder in a custom system prompt', () => {
            const [system] = buildMessages(['Hello'], {
                ...config,
                context: 'file docs/ru/index.md',
                systemPrompt: 'You are translating {{context}}',
            });

            expect(system.content).toContain('You are translating Document context');
        });

        it('should append context files to the system prompt in order', () => {
            const [system, user] = buildMessages(['Hello'], {
                ...config,
                contextFiles: ['# Project info\n\nDeploy platform.', '# Glossary\n\ncloud'],
            });

            expect(system.content).toContain('reference materials');
            expect(system.content).toMatch(/Project info[\s\S]*Glossary/);
            expect(user.content).not.toContain('Project info');
        });

        it('should not mention reference materials without context files', () => {
            const [system] = buildMessages(['Hello'], config);

            expect(system.content).not.toContain('reference materials');
        });

        it('should respect contextFiles placeholder in a custom system prompt', () => {
            const [system] = buildMessages(['Hello'], {
                ...config,
                promptMode: 'replace',
                systemPrompt: 'Intro.\n\n{{contextFiles}}\n\nRules.',
                contextFiles: ['# Glossary'],
            });

            expect(system.content).toMatch(/Intro\.[\s\S]*# Glossary[\s\S]*Rules\./);
            expect(system.content).not.toContain('{{contextFiles}}');
        });

        it('should place context files into the user prompt when referenced there', () => {
            const [system, user] = buildMessages(['Hello'], {
                ...config,
                userPrompt: '{{contextFiles}}\n\n{{fragments}}',
                contextFiles: ['# Glossary'],
            });

            expect(user.content).toContain('# Glossary');
            expect(system.content).not.toContain('# Glossary');
        });

        it('should drop the placeholder when no context files are configured', () => {
            const [system] = buildMessages(['Hello'], {
                ...config,
                promptMode: 'replace',
                systemPrompt: 'Intro.\n\n{{contextFiles}}',
            });

            expect(system.content).not.toContain('{{contextFiles}}');
        });
    });

    describe('resolveContextValue', () => {
        it('should read an existing file', () => {
            const dir = mkdtempSync(join(tmpdir(), 'translate-context-'));
            const file = join(dir, 'glossary.md');
            writeFileSync(file, '# Glossary\n\ncloud\n');

            expect(resolveContextValue(file)).toBe('# Glossary\n\ncloud\n');
        });

        it('should resolve a relative path with the resolve callback', () => {
            const dir = mkdtempSync(join(tmpdir(), 'translate-context-'));
            writeFileSync(join(dir, 'info.md'), 'Project info.');

            expect(resolveContextValue('info.md', (path) => join(dir, path))).toBe('Project info.');
        });

        it('should not fall back to cwd when the resolve callback is provided', () => {
            const dir = mkdtempSync(join(tmpdir(), 'translate-context-'));

            // package.json exists in cwd, but config values resolve from the config dir only.
            expect(() => resolveContextValue('package.json', (path) => join(dir, path))).toThrow(
                'Context file not found',
            );
        });

        it('should pass a multi-line value through as a literal', () => {
            expect(resolveContextValue('Use these terms:\n- cloud')).toBe(
                'Use these terms:\n- cloud',
            );
        });

        it('should fail on a missing file path', () => {
            expect(() => resolveContextValue('missing-context.md')).toThrow(
                'Context file not found',
            );
        });
    });
});
