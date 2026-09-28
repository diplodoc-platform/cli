import type {UntranslatedLine} from './types';
import type Token from 'markdown-it/lib/token';

import MarkdownIt from 'markdown-it';

import {scanPage} from './markdown';

const PREVIEW_LIMIT = 80;
const parser = new MarkdownIt();
const normalizeSpace = (text: string) => text.trim().replace(/\s+/g, ' ');

function proseText(tokens: Token[]): string {
    return tokens
        .map((token) => {
            if (token.type === 'code_inline') {
                return '';
            }
            return token.children ? proseText(token.children) : token.content;
        })
        .join('');
}

/**
 * Returns a regexp matching characters of the source language script,
 * or null when the language pair cannot be discriminated by script
 * (e.g. latin-to-latin pairs).
 *
 * Mirrors the untranslated-unit heuristic of the AI provider, but on
 * the file level: any source-script text that survived translation and
 * is not present in the reference is a missed segment.
 */
export function sourceScriptMarker(sourceLanguage: string, targetLanguage: string): RegExp | null {
    const scriptOf = (language: string): string | undefined => {
        try {
            return new Intl.Locale(language).maximize().script;
        } catch {
            return undefined;
        }
    };

    const source = scriptOf(sourceLanguage);
    const target = scriptOf(targetLanguage);

    if (!source || source === 'Latn' || source === target) {
        return null;
    }

    try {
        return new RegExp(String.raw`\p{Script=${source}}`, 'u');
    } catch {
        return null;
    }
}

/**
 * Finds lines of the translated page that still contain source-script
 * text outside code fences.
 *
 * Lines that appear verbatim in the reference translation are legal:
 * the reference itself keeps source-language examples in some places
 * (inline samples, proper names), and the translation is allowed to
 * keep exactly the same ones.
 */
export function findUntranslatedLines(
    translated: string,
    reference: string,
    marker: RegExp | null,
): UntranslatedLine[] {
    if (!marker) {
        return [];
    }

    const referenceLines = new Set(reference.split('\n').map(normalizeSpace));

    const result: UntranslatedLine[] = [];
    const page = scanPage(translated);

    for (const {line, text} of page.prose) {
        const trimmed = text.trim();
        if (!marker.test(proseText(parser.parseInline(trimmed, {})))) {
            continue;
        }
        if (referenceLines.has(normalizeSpace(trimmed))) {
            continue;
        }
        result.push({
            line,
            text:
                trimmed.length > PREVIEW_LIMIT ? trimmed.slice(0, PREVIEW_LIMIT) + '...' : trimmed,
        });
    }

    return result;
}
