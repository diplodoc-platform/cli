import {basename, dirname, extname, join, resolve} from 'path';
import shell from 'shelljs';
import log from '@diplodoc/transform/lib/log';
import liquid from '@diplodoc/transform/lib/liquid';
import {ChangelogItem} from '@diplodoc/transform/lib/plugins/changelog/types';

import {ArgvService, PluginService} from '../services';
import {getVarsPerFile, logger} from '../utils';
import {PluginOptions, ResolveMd2MdOptions} from '../models';
import {PROCESSING_FINISHED} from '../constants';
import {enrichWithFrontMatter} from '../services/metadata';

export async function resolveMd2Md(options: ResolveMd2MdOptions): Promise<void> {
    const {inputPath, outputPath, metadata: metadataOptions, fs} = options;
    const {input, output, changelogs: changelogsSetting, included} = ArgvService.getConfig();
    const resolvedInputPath = resolve(input, inputPath);

    const vars = getVarsPerFile(inputPath);

    const content = await enrichWithFrontMatter({
        fileContent: await fs.readAsync(resolvedInputPath),
        metadataOptions,
        resolvedFrontMatterVars: {
            systemVars: vars.__system as unknown,
            metadataVars: vars.__metadata,
        },
    });

    async function copyFile(targetPath: string, targetDestPath: string, options?: PluginOptions) {
        shell.mkdir('-p', dirname(targetDestPath));

        if (options) {
            const sourceIncludeContent = fs.read(targetPath);
            const {result} = await transformMd2Md(sourceIncludeContent, options);

            await fs.writeAsync(targetDestPath, result);
        } else {
            shell.cp(targetPath, targetDestPath);
        }
    }

    const {result, changelogs} = await transformMd2Md(content, {
        ...options,
        path: resolvedInputPath,
        destPath: outputPath,
        root: resolve(input),
        destRoot: resolve(output),
        collectOfPlugins: PluginService.getCollectOfPlugins(),
        vars: vars,
        log,
        included,
        copyFile,
        context: options.context,
        fs: options.fs,
        deps: options.deps,
    });

    await fs.writeAsync(outputPath, result);

    if (changelogsSetting && changelogs?.length) {
        const mdFilename = basename(outputPath, extname(outputPath));
        const outputDir = dirname(outputPath);

        let index = 0;
        for (const changes of changelogs) {
            let changesName;
            const changesDate = changes.date as string | undefined;
            const changesIdx = changes.index as number | undefined;
            if (typeof changesIdx === 'number') {
                changesName = String(changesIdx);
            }
            if (!changesName && changesDate && /^\d{4}/.test(changesDate)) {
                changesName = Math.trunc(new Date(changesDate).getTime() / 1000);
            }
            if (!changesName) {
                changesName = `name-${mdFilename}-${String(changelogs.length - index).padStart(
                    3,
                    '0',
                )}`;
            }

            const changesPath = join(outputDir, `__changes-${changesName}.json`);

            await fs.writeAsync(
                changesPath,
                JSON.stringify({
                    ...changes,
                    source: mdFilename,
                }),
            );

            index++;
        }
    }

    logger.info(inputPath, PROCESSING_FINISHED);

    return undefined;
}

export async function liquidMd2Md(input: string, vars: Record<string, unknown>, path: string) {
    const {applyPresets, resolveConditions, conditionsInCode, useLegacyConditions} =
        ArgvService.getConfig();

    return await liquid(input, vars, path, {
        conditions: resolveConditions,
        substitutions: applyPresets,
        conditionsInCode,
        withSourceMap: true,
        keepNotVar: true,
        useLegacyConditions,
    });
}

async function transformMd2Md(input: string, options: PluginOptions) {
    const {disableLiquid, changelogs: changelogsSetting} = ArgvService.getConfig();
    const {vars = {}, path, collectOfPlugins, log: pluginLog} = options;

    let output = input;
    const changelogs: ChangelogItem[] = [];

    if (!disableLiquid) {
        const liquidResult = await liquidMd2Md(input, vars, path);

        output = liquidResult.output;
    }

    if (collectOfPlugins) {
        output = await collectOfPlugins(output, {
            ...options,
            vars,
            path,
            collectOfPlugins,
            changelogs,
            extractChangelogs: Boolean(changelogsSetting),
        });
    }

    return {
        result: output,
        changelogs,
        logs: pluginLog.get(),
    };
}
