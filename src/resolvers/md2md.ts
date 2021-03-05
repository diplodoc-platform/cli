import {readFileSync, writeFileSync} from 'fs';
import {basename, dirname, join, resolve} from 'path';
import shell from 'shelljs';

import log, {Logger} from '@doc-tools/transform/lib/log';
import liquid from '@doc-tools/transform/lib/liquid';

import {ArgvService, PresetService} from '../services';
import {getPlugins} from '../utils';

function transformMd2Md(input: string, options: ResolverOptions) {
    const {applyPresets, resolveConditions, disableLiquid} = ArgvService.getConfig();
    const {vars = {}, path, root, destPath, destRoot, collectOfPlugins, log, copyFile, singlePage} = options;
    let output = disableLiquid ? input : liquid(input, vars, path, {
        conditions: resolveConditions,
        substitutions: applyPresets,
    });

    if (typeof collectOfPlugins === 'function') {
        output = collectOfPlugins(output, {
            vars,
            path,
            root,
            destPath,
            destRoot,
            log,
            copyFile,
            collectOfPlugins,
            singlePage,
        });
    }

    return {
        result: output,
        logs: log.get(),
    };
}

export interface ResolverOptions {
    vars: Record<string, string>;
    path: string;
    log: Logger;
    copyFile: (targetPath: string, targetDestPath: string, options?: ResolverOptions) => void;
    singlePage?: boolean;
    root?: string;
    destPath?: string;
    destRoot?: string;
    collectOfPlugins?: (input: string, options: ResolverOptions) => string;
}

interface Plugin {
    collect: (input: string, options: ResolverOptions) => string | void;
}

function makeCollectOfPlugins(plugins: Plugin[]) {
    const pluginsWithCollect = plugins.filter((plugin: Plugin) => {
        return typeof plugin.collect === 'function';
    });

    return (output: string, options: ResolverOptions) => {
        let collectsOutput = output;

        pluginsWithCollect.forEach((plugin: Plugin) => {
            const collectOutput = plugin.collect(collectsOutput, options);

            collectsOutput = typeof collectOutput === 'string' ? collectOutput : collectsOutput;
        });

        return collectsOutput;
    };
}

export interface ResolveMd2MdOptions {
    inputPath: string;
    outputPath: string;
    singlePage?: boolean;
}
/**
 * Transforms raw markdown file to public markdown document.
 * @param ResolveMd2MdOptions
 * @return {string}
 */
export function resolveMd2Md({inputPath, outputPath, singlePage}: ResolveMd2MdOptions): string {
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
        singlePage,
        vars: {
            ...PresetService.get(dirname(inputPath)),
            ...vars,
        },
        log,
        copyFile,
    });
    return result;
}

function copyFile(targetPath: string, targetDestPath: string, options?: ResolverOptions) {
    shell.mkdir('-p', dirname(targetDestPath));

    if (options) {
        const sourceIncludeContent = readFileSync(targetPath, 'utf8');
        const {result} = transformMd2Md(sourceIncludeContent, options);

        writeFileSync(targetDestPath, result);
    } else {
        shell.cp(targetPath, targetDestPath);
    }
}
