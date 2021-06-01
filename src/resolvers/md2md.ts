import {readFileSync, writeFileSync} from 'fs';
import {dirname, resolve} from 'path';
import shell from 'shelljs';
import log, {Logger} from '@doc-tools/transform/lib/log';
import liquid from '@doc-tools/transform/lib/liquid';

import {ArgvService} from '../services';
import {getPlugins, logger, mergeVars} from '../utils';
import {ResolveMd2MdOptions} from '../models';
import {PROCESSING_HAS_BEEN_FINISHED} from '../constants';
import {getContentWithUpdatedMetadata} from '../services/metadata';

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

export async function resolveMd2Md(options: ResolveMd2MdOptions): Promise<void> {
    const {inputPath, outputPath, singlePage, metadata} = options;
    const {input, output, vars} = ArgvService.getConfig();
    const resolvedInputPath = resolve(input, inputPath);

    let content: string = readFileSync(resolvedInputPath, 'utf8');

    if (metadata && metadata.isContributorsEnabled) {
        content = await getContentWithUpdatedMetadata(metadata, content);
    }

    const plugins = getPlugins();
    const collectOfPlugins = makeCollectOfPlugins(plugins);

    const {result} = transformMd2Md(content, {
        path: resolvedInputPath,
        destPath: outputPath,
        root: resolve(input),
        destRoot: resolve(output),
        collectOfPlugins,
        singlePage,
        vars: mergeVars(inputPath, vars),
        log,
        copyFile,
    });

    writeFileSync(outputPath, result);
    logger.info(inputPath, PROCESSING_HAS_BEEN_FINISHED);
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
