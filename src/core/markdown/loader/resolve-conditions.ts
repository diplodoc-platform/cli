import type {PageContent} from '@diplodoc/page-constructor-extension';
import type {LoaderContext} from '../loader';

import {dump as yamlDump, load as yamlLoad} from 'js-yaml';

import {filterBlocksByConditions, hasWhenConditions} from '~/core/utils';

import {PC_REGEX} from '../utils';

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

        if (!hasWhenConditions(data)) {
            continue;
        }

        const filtered = filterBlocksByConditions(data, vars, skipMissingVars);
        const hasBlocks = Array.isArray(filtered.blocks) && filtered.blocks.length > 0;

        const blockStart = match.index;
        const blockEnd = contentStart + closeMatch.index + closeMatch[0].length;

        if (hasBlocks) {
            const yaml = yamlDump(filtered, {
                lineWidth: -1,
                noRefs: true,
                quotingType: "'",
                forceQuotes: false,
            });

            const indentedYaml = yaml
                .split('\n')
                .filter((line) => line.trim())
                .map((line) => `${indent}${line}`)
                .join('\n');

            blocks.push({
                start: blockStart,
                end: blockEnd,
                replacement: `${indent}::: page-constructor\n${indentedYaml}\n${indent}:::\n`,
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
