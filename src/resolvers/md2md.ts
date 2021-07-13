import {readFileSync, writeFileSync} from 'fs';
import {dirname, resolve} from 'path';
import shell from 'shelljs';
import log from '@doc-tools/transform/lib/log';
import liquid from '@doc-tools/transform/lib/liquid';

import {ArgvService, PresetService, PluginService} from '../services';
import {logger} from '../utils';
import {PluginOptions, ResolveMd2MdOptions} from '../models';
import {PROCESSING_FINISHED} from '../constants';
import {getContentWithUpdatedMetadata} from '../services/metadata';

export async function resolveMd2Md(options: ResolveMd2MdOptions): Promise<string | void> {
    const {inputPath, outputPath, singlePage, metadata} = options;
    const {input, output, vars: configVars} = ArgvService.getConfig();
    const resolvedInputPath = resolve(input, inputPath);
    const vars = {
        ...PresetService.get(dirname(inputPath)),
        ...configVars,
    };
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
    } else {
        writeFileSync(outputPath, result);
        logger.info(inputPath, PROCESSING_FINISHED);
    }
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

function transformMd2Md(input: string, options: PluginOptions) {
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
