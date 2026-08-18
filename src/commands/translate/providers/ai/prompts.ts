import type {ChatMessage} from './clients/types';

import {ok} from 'node:assert';
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
    /** Human-readable document context, e.g. `document "Quickstart" (file docs/ru/index.md)`. */
    context?: string;
    /** Resolved contents of --context-file values, injected as reference material. */
    contextFiles?: string[];
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

    {{context}}

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

/**
 * Resolves a --context-file value: a path to a text file or a literal
 * multi-line text block. Unlike prompts, a single-line value is always
 * a path, so a missing file is a configuration error, not a literal.
 *
 * The `resolve` callback is the only base when provided: config values
 * must not silently pick up a same-named file from the process cwd.
 */
export function resolveContextValue(value: string, resolve?: (path: string) => string): string {
    const trimmed = value.trim();

    // A real file path never contains a line break.
    if (!trimmed.includes('\n')) {
        const path = resolve ? resolve(trimmed) : trimmed;

        if (existsSync(path)) {
            return readFileSync(path, 'utf8');
        }

        ok(false, `Context file not found: ${value}`);
    }

    return value;
}

const CONTEXT_FILES_PREAMBLE = 'Use the following reference materials for this translation:';

function renderContextFiles(sections: string[]): string {
    const items = sections.map((section) => section.trim()).filter(Boolean);
    if (!items.length) {
        return '';
    }
    return [CONTEXT_FILES_PREAMBLE, ...items].join('\n\n');
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
 *
 * Context files land in the system prompt: they are identical for every
 * batch, and a static system prompt plays well with provider-side prompt
 * caching. A `{{contextFiles}}` placeholder in either prompt overrides
 * the default placement.
 */
export function buildMessages(fragments: string[], config: PromptConfig): ChatMessage[] {
    const {systemPrompt, userPrompt, promptMode, sourceLanguage, targetLanguage, glossaryPairs} =
        config;

    const joined = joinFragments(fragments);
    const contextFiles = renderContextFiles(config.contextFiles || []);
    const vars = {
        source: sourceLanguage,
        target: targetLanguage,
        glossary: renderGlossary(glossaryPairs),
        context: config.context ? `Document context: ${config.context}.` : '',
        contextFiles,
        separator: FRAGMENT_SEPARATOR,
        fragments: joined,
        text: joined,
    };

    let systemTemplate: string;
    if (promptMode === 'replace' && systemPrompt) {
        systemTemplate = systemPrompt;
    } else if (systemPrompt) {
        systemTemplate = DEFAULT_SYSTEM_PROMPT + '\n\n' + systemPrompt;
    } else {
        systemTemplate = DEFAULT_SYSTEM_PROMPT;
    }

    const userTemplate = userPrompt || DEFAULT_USER_PROMPT;

    const placed = [systemTemplate, userTemplate].some((template) =>
        template.includes('{{contextFiles}}'),
    );
    if (contextFiles && !placed) {
        systemTemplate += '\n\n{{contextFiles}}';
    }

    return [
        {role: 'system', content: applyVars(systemTemplate, vars)},
        {role: 'user', content: applyVars(userTemplate, vars)},
    ];
}
