import {readFileSync, writeFileSync} from 'fs';
import {dirname, resolve} from 'path';
import shell from 'shelljs';
import log from '@doc-tools/transform/lib/log';
import liquid from '@doc-tools/transform/lib/liquid';

import {ArgvService, PluginService} from '../services';
import {logger, getVarsPerFile} from '../utils';
import {PluginOptions, ResolveMd2MdOptions} from '../models';
import {PROCESSING_FINISHED} from '../constants';
import {getContentWithUpdatedMetadata} from '../services/metadata';

export async function resolveMd2Md(options: ResolveMd2MdOptions): Promise<string | void> {
    const {inputPath, outputPath, singlePage, metadata} = options;
    const {input, output} = ArgvService.getConfig();
    const resolvedInputPath = resolve(input, inputPath);
    const vars = getVarsPerFile(inputPath);

    const content = await getContentWithUpdatedMetadata(
        readFileSync(resolvedInputPath, 'utf8'),
        metadata,
        vars.__system,
    );

    const {result} = transformMd2Md(content, {
        path: resolvedInputPath,
        destPath: outputPath,
        root: resolve(input),
        destRoot: resolve(output),
        collectOfPlugins: PluginService.getCollectOfPlugins(),
        singlePage,
        vars,
        log,
        copyFile,
    });

    if (singlePage) {
        return result;
    }

    writeFileSync(outputPath, result);
    logger.info(inputPath, PROCESSING_FINISHED);
}

function copyFile(targetPath: string, targetDestPath: string, options?: PluginOptions) {
    shell.mkdir('-p', dirname(targetDestPath));

    if (options) {
        const sourceIncludeContent = readFileSync(targetPath, 'utf8');
        const {result} = transformMd2Md(sourceIncludeContent, options);

        writeFileSync(targetDestPath, result);
    } else {
        shell.cp(targetPath, targetDestPath);
    }
}

export function liquidMd2Md(input: string, vars: Record<string, unknown>, path: string) {
    const {
        applyPresets,
        resolveConditions,
    } = ArgvService.getConfig();

    return liquid(input, vars, path, {
        conditions: resolveConditions,
        substitutions: applyPresets,
        withSourceMap: true,
        keepNotVar: true,
    });
}

function transformMd2Md(input: string, options: PluginOptions) {
    const {
        disableLiquid,
    } = ArgvService.getConfig();
    const {
        vars = {},
        path,
        root,
        destPath,
        destRoot,
        collectOfPlugins,
        log: pluginLog,
        copyFile: pluginCopyFile,
        singlePage,
    } = options;

    let output = input;

    if (!disableLiquid) {
        const liquidResult = liquidMd2Md(input, vars, path);

        output = liquidResult.output;
    }

    if (collectOfPlugins) {
        output = collectOfPlugins(output, {
            vars,
            path,
            root,
            destPath,
            destRoot,
            log: pluginLog,
            copyFile: pluginCopyFile,
            collectOfPlugins,
            singlePage,
        });
    }

    return {
        result: output,
        logs: pluginLog.get(),
    };
}
