import type {ChatMessage} from './clients/types';

import {existsSync, readFileSync} from 'node:fs';
import {dedent} from 'ts-dedent';

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
 * The optional `resolve` callback maps config-relative paths to absolute ones.
 */
export function resolvePromptValue(
    value: string | undefined,
    resolve?: (path: string) => string,
): string | undefined {
    if (!value) {
        return undefined;
    }

    const trimmed = value.trim();

    // A real file path never contains a line break.
    if (!trimmed.includes('\n')) {
        if (existsSync(trimmed)) {
            return readFileSync(trimmed, 'utf8');
        }

        if (resolve) {
            const resolved = resolve(trimmed);
            if (existsSync(resolved)) {
                return readFileSync(resolved, 'utf8');
            }
        }
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
    const lines = pairs.map(
        ({sourceText, translatedText}) => `- ${sourceText} → ${translatedText}`,
    );
    return `Use these required term translations:\n${lines.join('\n')}\n`;
}

function joinFragments(fragments: string[]): string {
    return fragments.join(`\n${FRAGMENT_SEPARATOR}\n`);
}

/**
 * Splits an LLM response back into fragments using the delimiter.
 */
export function splitFragments(text: string): string[] {
    return text.split(FRAGMENT_SEPARATOR).map((part) => part.trim());
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

    const joined = joinFragments(fragments);
    const vars = {
        source: sourceLanguage,
        target: targetLanguage,
        glossary: renderGlossary(glossaryPairs),
        separator: FRAGMENT_SEPARATOR,
        fragments: joined,
        text: joined,
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
