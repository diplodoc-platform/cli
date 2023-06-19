import {existsSync, readFileSync, writeFileSync} from 'fs';
import {dirname, resolve, join, basename, extname} from 'path';
import shell from 'shelljs';
import log from '@doc-tools/transform/lib/log';
import liquid from '@doc-tools/transform/lib/liquid';

import {ArgvService, PluginService} from '../services';
import {logger, getVarsPerFile} from '../utils';
import {PluginOptions, ResolveMd2MdOptions} from '../models';
import {PROCESSING_FINISHED} from '../constants';
import {getContentWithUpdatedMetadata} from '../services/metadata';
import {ChangelogItem} from '@doc-tools/transform/lib/plugins/changelog/types';

export async function resolveMd2Md(options: ResolveMd2MdOptions): Promise<void> {
    const {inputPath, outputPath, metadata} = options;
    const {input, output} = ArgvService.getConfig();
    const resolvedInputPath = resolve(input, inputPath);
    const vars = getVarsPerFile(inputPath);

    const content = await getContentWithUpdatedMetadata(
        readFileSync(resolvedInputPath, 'utf8'),
        metadata,
        vars.__system,
    );

    const {result, changelogs} = transformMd2Md(content, {
        path: resolvedInputPath,
        destPath: outputPath,
        root: resolve(input),
        destRoot: resolve(output),
        collectOfPlugins: PluginService.getCollectOfPlugins(),
        vars,
        log,
        copyFile,
    });

    writeFileSync(outputPath, result);

    if (changelogs?.length) {
        const mdFilename = basename(outputPath, extname(outputPath));
        const outputDir = dirname(outputPath);
        changelogs.forEach((changes, index) => {
            let changesName;
            const changesDate = changes.date as string | undefined;
            const changesIdx = changes.index as number | undefined;
            if (typeof changesIdx === 'number') {
                changesName = changesIdx;
            }
            if (!changesName && changesDate && /^\d{4}/.test(changesDate)) {
                changesName = Math.trunc(new Date(changesDate).getTime() / 1000);
            }
            if (!changesName) {
                changesName = `name-${mdFilename}-${String(index).padStart(3, '0')}`;
            }

            const changesPath = join(outputDir, `changes-${changesName}.json`);

            if (existsSync(changesPath)) {
                throw new Error(`Changelog ${changesPath} already exists!`);
            }

            writeFileSync(changesPath, JSON.stringify({
                ...changes,
                source: mdFilename,
            }));
        });
    }

    logger.info(inputPath, PROCESSING_FINISHED);

    return undefined;
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
        changelogs: extractChangelogs,
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
    } = options;

    let output = input;
    const changelogs: ChangelogItem[] = [];

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
            changelogs,
            extractChangelogs,
        });
    }

    return {
        result: output,
        changelogs,
        logs: pluginLog.get(),
    };
}
