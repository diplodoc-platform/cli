import type {Run} from '~/commands/build';
import type {LoaderContext} from '~/core/markdown/loader';
import type {Directive, DirectiveMatch} from './parse';
import type {ResolvedSource} from './sources';

import {extname} from 'node:path';
import {bold} from 'chalk';

import {parseDirectives} from './parse';
import {extract} from './fragment';
import {permalink, readSourceFile} from './sources';

const LANGS: Hash<string> = {
    '.c': 'c',
    '.cpp': 'cpp',
    '.cs': 'csharp',
    '.go': 'go',
    '.h': 'cpp',
    '.java': 'java',
    '.js': 'javascript',
    '.json': 'json',
    '.kt': 'kotlin',
    '.md': 'markdown',
    '.php': 'php',
    '.proto': 'protobuf',
    '.py': 'python',
    '.rb': 'ruby',
    '.rs': 'rust',
    '.sh': 'bash',
    '.sql': 'sql',
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.xml': 'xml',
    '.yaml': 'yaml',
    '.yml': 'yaml',
};

/**
 * Wraps code in a fence long enough to survive backtick runs inside the snippet.
 */
function fence(code: string, lang: string) {
    const runs = [...code.matchAll(/`+/g)].map((match) => match[0].length);
    const ticks = '`'.repeat(Math.max(3, Math.max(0, ...runs) + 1));

    return `${ticks}${lang}\n${code}\n${ticks}`;
}

function language(directive: Directive) {
    return directive.lang ?? LANGS[extname(directive.path).toLowerCase()] ?? '';
}

/**
 * Reads a source file once per worker, no matter how many directives point at it.
 */
function reader(run: Run) {
    const cache = new Map<string, Promise<string>>();

    return (source: ResolvedSource, path: string) => {
        const key = `${source.name}:${path}`;
        let content = cache.get(key);

        if (!content) {
            content = readSourceFile(run, source, path);
            cache.set(key, content);
        }

        return content;
    };
}

/**
 * Replacement for a directive that could not be resolved.
 *
 * Keeping the original text would be worse than useless: `[](source:path)` is
 * valid link syntax, so asset resolution would then try to open it as a local
 * file and bury the real error under a cascade of ENOENTs. An HTML comment is
 * inert for link and dependency resolution and invisible in the output.
 *
 * `subject` names the offending directive and nothing else — raw error text can
 * carry absolute filesystem paths, and this string ends up in published
 * artifacts. The full reason goes to the logger, which masks scope paths.
 */
function placeholder(subject: string) {
    return `<!-- include-code failed: ${subject.replace(/--+/g, '-')} -->`;
}

export const collect = (run: Run, sources: Hash<ResolvedSource>) => {
    const read = reader(run);

    async function render(this: LoaderContext, item: DirectiveMatch) {
        const where = `${bold(item.match)} in ${bold(this.path)}`;

        if (!item.directive) {
            this.logger.error(`Invalid include-code directive: ${item.error} — ${where}`);
            return placeholder('invalid directive');
        }

        const directive = item.directive;
        const source = sources[directive.source];

        if (!source) {
            this.logger.error(
                `Unknown code source ${bold(directive.source)}, ` +
                    `declare it in the 'code-sources' section of the config — ${where}`,
            );
            return placeholder(`unknown source '${directive.source}'`);
        }

        if (directive.fragment?.type === 'lines') {
            this.logger.warn(
                `Line ranges break on the first refactor in the source repository. ` +
                    `Prefer a named region — ${where}`,
            );
        }

        try {
            const content = await read(source, directive.path);
            const {code, start, end} = extract(content, directive.fragment, directive.dedent);

            const block = fence(code, language(directive));

            if (!directive.link) {
                return block;
            }

            const url = permalink(source, directive.path, start, end);

            if (!url) {
                return block;
            }

            const caption = directive.caption || `${directive.source}:${directive.path}`;

            return `${block}\n\n[${caption}](${url})`;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            this.logger.error(`Failed to resolve include-code: ${message} — ${where}`);

            return placeholder(`${directive.source}:${directive.path}`);
        }
    }

    return async function (this: LoaderContext, content: string) {
        const matches = parseDirectives(content);

        if (!matches.length) {
            return content;
        }

        let result = '';
        let last = 0;

        for (const item of matches) {
            result += content.slice(last, item.location[0]);
            result += await render.call(this, item);
            last = item.location[1];
        }

        return result + content.slice(last);
    };
};
