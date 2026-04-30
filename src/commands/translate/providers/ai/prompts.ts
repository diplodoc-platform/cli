import {existsSync, readFileSync} from 'node:fs';
import {dedent} from 'ts-dedent';

import type {ChatMessage} from './clients/types';

export type PromptMode = 'append' | 'replace';

export type GlossaryPair = {sourceText: string; translatedText: string};

export type PromptConfig = {
    systemPrompt?: string;
    userPrompt?: string;
    promptMode: PromptMode;
    sourceLanguage: string;
    targetLanguage: string;
    glossaryPairs: GlossaryPair[];
};

const FRAGMENT_SEPARATOR = '<<<§§§>>>';

export const DEFAULT_SYSTEM_PROMPT = dedent`
    You are a professional technical documentation translator.
    Translate the supplied fragments from {{source}} into {{target}}.

    Strict rules:
    - Preserve all Markdown syntax, HTML tags, code blocks, inline code, links, images and Liquid/YFM directives exactly as they appear.
    - Do not translate code, identifiers, file paths, URLs, or text inside <code> or fenced code blocks.
    - Do not add explanations, prefaces, or trailing notes — return translations only.
    - Keep the same number of fragments and their original order.
    - Each fragment is delimited by the line "${FRAGMENT_SEPARATOR}". Keep this exact delimiter between fragments in your output.
    - If a fragment is empty or contains only formatting, return it unchanged.
`;

export const DEFAULT_USER_PROMPT = dedent`
    Translate the following fragments from {{source}} into {{target}}.
    Return the translated fragments in the same order, separated by the exact delimiter line "{{separator}}".

    {{glossary}}

    {{fragments}}
`;

export {FRAGMENT_SEPARATOR};

/**
 * Resolves a prompt value: if it is an existing file path, read it; otherwise use as-is.
 */
export function resolvePromptValue(value: string | undefined): string | undefined {
    if (!value) {
        return undefined;
    }

    const trimmed = value.trim();
    if (existsSync(trimmed)) {
        return readFileSync(trimmed, 'utf8');
    }

    return value;
}

function applyVars(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return key in vars ? vars[key] : match;
    });
}

function renderGlossary(pairs: GlossaryPair[]): string {
    if (!pairs.length) {
        return '';
    }
    const lines = pairs.map(({sourceText, translatedText}) => `- ${sourceText} → ${translatedText}`);
    return `Use these required term translations:\n${lines.join('\n')}\n`;
}

function joinFragments(fragments: string[]): string {
    return fragments.join(`\n${FRAGMENT_SEPARATOR}\n`);
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Splits an LLM response back into fragments using the delimiter.
 */
export function splitFragments(text: string): string[] {
    const delimiter = new RegExp(`\\s*\\n?${escapeRegExp(FRAGMENT_SEPARATOR)}\\n?\\s*`, 'g');
    return text.split(delimiter).map((part) => part.replace(/^\n+|\n+$/g, ''));
}

/**
 * Builds chat messages for a batch of fragments.
 *
 * `promptMode`:
 *  - `append` (default): combines the default system prompt with the user-provided system prompt.
 *  - `replace`: the user-provided system prompt fully replaces the default.
 */
export function buildMessages(fragments: string[], config: PromptConfig): ChatMessage[] {
    const {systemPrompt, userPrompt, promptMode, sourceLanguage, targetLanguage, glossaryPairs} =
        config;

    const vars = {
        source: sourceLanguage,
        target: targetLanguage,
        glossary: renderGlossary(glossaryPairs),
        separator: FRAGMENT_SEPARATOR,
        fragments: joinFragments(fragments),
        text: joinFragments(fragments),
    };

    let system: string;
    if (promptMode === 'replace' && systemPrompt) {
        system = applyVars(systemPrompt, vars);
    } else if (systemPrompt) {
        system = applyVars(DEFAULT_SYSTEM_PROMPT, vars) + '\n\n' + applyVars(systemPrompt, vars);
    } else {
        system = applyVars(DEFAULT_SYSTEM_PROMPT, vars);
    }

    const userTemplate = userPrompt || DEFAULT_USER_PROMPT;
    const user = applyVars(userTemplate, vars);

    return [
        {role: 'system', content: system},
        {role: 'user', content: user},
    ];
}
