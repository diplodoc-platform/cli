import {readFileSync, writeFileSync} from 'fs';
import {basename, dirname, join, resolve} from 'path';
import shell from 'shelljs';
import {bold} from 'chalk';
import MarkdownIt from 'markdown-it';
import Token from 'markdown-it/lib/token';

// @ts-ignore
import imsize from 'markdown-it-imsize';
import log from 'yfm-transform/lib/log';
import liquid from 'yfm-transform/lib/liquid';
import {resolveRelativePath, isLocalUrl} from 'yfm-transform/lib/utils';

import {ArgvService, PresetService} from '../services';
import {getPlugins} from '../utils';

const includes: string[] = [];

function findImages(input: string, options: ResolverOptions) {
    const md = new MarkdownIt()
        .use(imsize);

    const {path, destPath = ''} = options;
    const tokens: Token[] = md.parse(input, {});

    tokens.forEach((token: Token) => {
        if (token.type !== 'inline') {
            return;
        }

        const children: Token[] = token.children || [];

        children.forEach((childToken: Token) => {
            if (childToken.type !== 'image') {
                return;
            }

            const src = childToken.attrGet('src') || '';

            if (!isLocalUrl(src)) {
                return;
            }

            const targetPath = resolveRelativePath(path, src);
            const targetDestPath = resolveRelativePath(destPath, src);

            shell.mkdir('-p', dirname(targetDestPath));
            shell.cp(targetPath, targetDestPath);
        });
    });
}

function transformIncludes(input: string, options: ResolverOptions) {
    const {path, destPath = ''} = options;
    const INCLUDE_REGEXP = /{%\s*include\s*(notitle)?\s*\[(.+?)]\((.+?)\)\s*%}/g;

    let match;

    while ((match = INCLUDE_REGEXP.exec(input)) !== null) {
        let [,,, relativePath] = match;

        relativePath = relativePath.split('#')[0];

        const includePath = resolveRelativePath(path, relativePath);
        const targetDestPath = resolveRelativePath(destPath, relativePath);

        if (includes.includes(includePath)) {
            log.error(`Circular includes: ${bold(includes.concat(path).join(' ▶ '))}`);
            break;
        }

        includes.push(includePath);
        const includeOptions = {
            ...options,
            path: includePath,
            destPath: targetDestPath,
        };

        try {
            const sourceIncludeContent = readFileSync(includePath, 'utf8');
            const {result} = transformMd2Md(sourceIncludeContent, includeOptions);

            shell.mkdir('-p', dirname(targetDestPath));
            writeFileSync(targetDestPath, result);
        } catch (e) {
            log.error(`No such file or has no access to ${bold(includePath)} in ${bold(path)}`);
        } finally {
            includes.pop();
        }
    }
}

function transformMd2Md(input: string, options: ResolverOptions) {
    const {applyPresets} = ArgvService.getConfig();
    const {vars = {}, path, collectOfPlugins} = options;
    const output = liquid(input, vars, path, {
        conditions: true,
        substitutions: applyPresets,
    });

    // find and copy includes
    transformIncludes(output, options);

    if (typeof collectOfPlugins === 'function') {
        collectOfPlugins(output, options);
    }

    // find and copy images
    findImages(output, options);

    return {
        result: output,
        logs: log.get(),
    };
}

export interface ResolverOptions {
    vars: Record<string, string>;
    path: string;
    root?: string;
    destPath?: string;
    destRoot?: string;
    collectOfPlugins?: (input: string, options: ResolverOptions) => void;
}

interface Plugin {
    collect: (input: string, options: ResolverOptions) => void;
}

function makeCollectOfPlugins(plugins: Plugin[]) {
    const pluginsWithCollect = plugins.filter((plugin: Plugin) => {
        return typeof plugin.collect === 'function';
    });

    return (output: string, options: ResolverOptions) => {
        pluginsWithCollect.forEach((plugin: Plugin) => {
            plugin.collect(output, options);
        });
    };
}

/**
 * Transforms raw markdown file to public markdown document.
 * @param inputPath
 * @param outputPath
 * @return {string}
 */
export function resolveMd2Md(inputPath: string, outputPath: string): string {
    const {input, output, vars} = ArgvService.getConfig();
    const resolvedInputPath = resolve(input, inputPath);
    const content: string = readFileSync(resolvedInputPath, 'utf8');

    const plugins = getPlugins();
    const collectOfPlugins = makeCollectOfPlugins(plugins);

    const {result} = transformMd2Md(content, {
        path: resolvedInputPath,
        destPath: join(outputPath, basename(inputPath)),
        root: resolve(input),
        destRoot: resolve(output),
        collectOfPlugins,
        vars: {
            ...PresetService.get(dirname(inputPath)),
            ...vars,
        },
    });
    return result;
}
