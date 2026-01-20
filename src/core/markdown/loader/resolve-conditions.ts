import type {LoaderContext} from '../loader';
import type {PageContent} from '@diplodoc/page-constructor-extension';

import {dump as yamlDump, load as yamlLoad} from 'js-yaml';

import {PC_REGEX} from '../utils';

type WhenValue = string | boolean;

type BlockWithWhen = {
    when?: WhenValue;
    [key: string]: unknown;
};

function evaluateWhen(
    whenValue: WhenValue,
    vars: Record<string, unknown>,
    skipMissingVars: boolean,
): boolean {
    if (typeof whenValue === 'boolean') {
        return whenValue;
    }

    if (typeof whenValue === 'string') {
        const trimmed = whenValue.trim();

        if (trimmed in vars) {
            return Boolean(vars[trimmed]);
        }

        const eqIndex = trimmed.indexOf('==');

        if (eqIndex > 0) {
            const varName = trimmed.slice(0, eqIndex).trim();
            const expectedValue = trimmed
                .slice(eqIndex + 2)
                .trim()
                .replace(/^['"]|['"]$/g, '');

            if (varName in vars) {
                return String(vars[varName]) === expectedValue;
            }

            return skipMissingVars;
        }

        return skipMissingVars;
    }

    return true;
}

function isBlockWithWhen(item: unknown): item is BlockWithWhen {
    return typeof item === 'object' && item !== null && 'when' in item;
}

function filterBlocks<T>(obj: T, vars: Record<string, unknown>, skipMissingVars: boolean): T {
    if (Array.isArray(obj)) {
        return obj
            .filter((item) => {
                if (isBlockWithWhen(item) && item.when !== undefined) {
                    return evaluateWhen(item.when, vars, skipMissingVars);
                }

                return true;
            })
            .map((item) => filterBlocks(item, vars, skipMissingVars)) as T;
    }

    if (obj && typeof obj === 'object' && obj !== null) {
        const result: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(obj)) {
            result[key] = filterBlocks(value, vars, skipMissingVars);
        }

        return result as T;
    }

    return obj;
}

type Replacement = {
    start: number;
    end: number;
    replacement: string;
};

function processPageConstructorBlocks(
    content: string,
    vars: Record<string, unknown>,
    skipMissingVars: boolean,
): string {
    const blocks: Replacement[] = [];
    const openRegex = new RegExp(PC_REGEX.source, PC_REGEX.flags);

    let match: RegExpExecArray | null;

    while ((match = openRegex.exec(content))) {
        const indent = match[1] || '';
        const contentStart = match.index + match[0].length;
        const closePattern = new RegExp(`^${indent}:::[ \\t]*$`, 'm');
        const remaining = content.slice(contentStart);
        const closeMatch = closePattern.exec(remaining);

        if (!closeMatch) {
            continue;
        }

        const yamlContent = remaining.slice(0, closeMatch.index);

        let data: PageContent;

        try {
            data = yamlLoad(yamlContent) as PageContent;
        } catch {
            continue;
        }

        const filtered = filterBlocks(data, vars, skipMissingVars);
        const hasBlocks = Array.isArray(filtered.blocks) && filtered.blocks.length > 0;

        const blockStart = match.index;
        const blockEnd = contentStart + closeMatch.index + closeMatch[0].length;

        if (hasBlocks) {
            const yaml = yamlDump(filtered, {lineWidth: -1, noRefs: true});

            blocks.push({
                start: blockStart,
                end: blockEnd,
                replacement: `${indent}::: page-constructor\n${yaml}${indent}:::\n`,
            });
        } else {
            blocks.push({
                start: blockStart,
                end: blockEnd,
                replacement: '',
            });
        }
    }

    for (let i = blocks.length - 1; i >= 0; i--) {
        const {start, end, replacement} = blocks[i];
        content = content.slice(0, start) + replacement + content.slice(end);
    }

    return content;
}

export function resolveConditions(this: LoaderContext, content: string): string {
    const {skipMissingVars = false} = this.options;
    const vars = this.vars || {};

    content = processPageConstructorBlocks(content, vars, skipMissingVars);

    return content;
}
