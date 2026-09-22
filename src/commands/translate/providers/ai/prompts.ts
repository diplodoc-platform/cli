import type {ChatMessage} from './clients/types';
import type {SeedHint} from './utils/cache';

import {ok} from 'node:assert';
import {existsSync, readFileSync} from 'node:fs';
import {dedent} from 'ts-dedent';

import {wordChanges} from './utils/diff';

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
    /** Previous version of every fragment that has one, parallel to the fragments. */
    hints?: (SeedHint | undefined)[];
};

const FRAGMENT_SEPARATOR = '<<<§§§>>>';

export const DEFAULT_SYSTEM_PROMPT = dedent`
    You are a professional technical documentation translator.
    Translate the supplied fragments from {{source}} into {{target}}.

    Strict rules:
    - Preserve all Markdown syntax, HTML tags, code blocks, inline code, links, images and Liquid/YFM directives exactly as they appear.
    - Never add Markdown that the fragment does not already contain. In particular, do not wrap a fragment or its edges in emphasis, backticks or any other delimiters: a fragment is a slice of a line, and the markup around it is restored automatically. Extra markers make the line render as ****Release date:** value.
    - Keep every <x .../> placeholder of the fragment exactly where it is and do not write its marker yourself: the placeholder already stands for that marker, and dropping one breaks the line.
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

    {{memory}}

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

const MEMORY_PREAMBLE = dedent`
    Translation memory. Some of the fragments below are edited versions of sentences that already have a translation.
    For each of them the previous source, its existing translation and the changes made in the source are listed.
    Fragments are numbered in the order they appear below.
    Apply exactly the listed changes to the existing translation: keep the wording of everything unchanged verbatim and translate only the changed parts.
    Do not keep anything that was removed from the source.
`;

/**
 * The memory block of a batch: one entry per hinted fragment, numbered by
 * its position among the fragments. Measured on ru->en point edits (see
 * docs/specs/2026-09-22-translate-memory-hints-design.md): the previous
 * translation alone makes the model keep it even where the source
 * changed; the listed changes are what makes it apply the edit.
 */
function renderMemory(fragments: string[], hints: (SeedHint | undefined)[]): string {
    const entries: string[] = [];

    hints.forEach((hint, index) => {
        if (!hint || index >= fragments.length) {
            return;
        }

        const changes = wordChanges(hint.source, fragments[index]);
        const lines = [
            `Fragment ${index + 1}:`,
            'Previous source:',
            hint.source,
            'Existing translation:',
            hint.translation,
        ];
        if (changes.length) {
            lines.push(`Changes in the source: ${changes.join('; ')}`);
        }
        entries.push(lines.join('\n'));
    });

    if (!entries.length) {
        return '';
    }

    return [MEMORY_PREAMBLE, ...entries].join('\n\n');
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
 * Context files and the glossary land in the system prompt: they are
 * identical for every batch, a static system prompt plays well with
 * provider-side prompt caching, and a fragment that directly follows a
 * list of glossary pairs tends to come back untranslated. A
 * `{{contextFiles}}` or `{{glossary}}` placeholder in either prompt
 * overrides the default placement.
 */
export function buildMessages(fragments: string[], config: PromptConfig): ChatMessage[] {
    const {systemPrompt, userPrompt, promptMode, sourceLanguage, targetLanguage, glossaryPairs} =
        config;

    const joined = joinFragments(fragments);
    const contextFiles = renderContextFiles(config.contextFiles || []);
    const glossary = renderGlossary(glossaryPairs);
    const memory = renderMemory(fragments, config.hints || []);
    const vars = {
        source: sourceLanguage,
        target: targetLanguage,
        glossary,
        context: config.context ? `Document context: ${config.context}.` : '',
        contextFiles,
        memory,
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

    let userTemplate = userPrompt || DEFAULT_USER_PROMPT;

    const placed = (placeholder: string) =>
        [systemTemplate, userTemplate].some((template) => template.includes(placeholder));

    if (memory && !placed('{{memory}}')) {
        userTemplate = userTemplate.replace(/\{\{(fragments|text)\}\}/, '{{memory}}\n\n{{$1}}');
    }

    if (contextFiles && !placed('{{contextFiles}}')) {
        systemTemplate += '\n\n{{contextFiles}}';
    }

    // Measured on deepseek-v4-flash: a heading came back untranslated in
    // 20 runs out of 20 with the glossary in the user message, 0 out of 15
    // with the same pairs in the system prompt.
    if (glossary && !placed('{{glossary}}')) {
        systemTemplate += '\n\n{{glossary}}';
    }

    return [
        {role: 'system', content: applyVars(systemTemplate, vars)},
        {role: 'user', content: applyVars(userTemplate, vars)},
    ];
}
