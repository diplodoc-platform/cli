import type {Run} from '~/commands/build';

import {readFileSync, writeFileSync} from 'fs';
import {basename, dirname, extname, join, resolve} from 'path';
import shell from 'shelljs';
import log from '@diplodoc/transform/lib/log';
import liquid from '@diplodoc/transform/lib/liquid';

import {ArgvService, PluginService} from '../services';
import {getVarsPerFile, getVarsPerRelativeFile, logger} from '../utils';
import {PluginOptions, ResolveMd2MdOptions} from '../models';
import {MD2MD_PARSER_PLUGINS, PROCESSING_FINISHED} from '../constants';
import {ChangelogItem} from '@diplodoc/transform/lib/plugins/changelog/types';
import {enrichWithFrontMatter} from '../services/metadata';
import transform from '@diplodoc/transform';
import {MarkdownItPluginCb} from '@diplodoc/transform/lib/plugins/typings';
import {getPublicPath} from '@diplodoc/transform/lib/utilsFS';

export async function resolveMd2Md(run: Run, options: ResolveMd2MdOptions): Promise<void> {
    const {inputPath, outputPath, metadata: metadataOptions} = options;
    const {input, output, changelogs: changelogsSetting, included} = ArgvService.getConfig();
    const resolvedInputPath = resolve(input, inputPath);

    const vars = getVarsPerFile(inputPath);

    const content = await enrichWithFrontMatter(run, {
        fileContent: readFileSync(resolvedInputPath, 'utf8'),
        metadataOptions,
        resolvedFrontMatterVars: {
            systemVars: vars.__system as unknown,
            metadataVars: vars.__metadata,
        },
    });

    const {result, changelogs} = transformMd2Md(content, {
        path: resolvedInputPath,
        destPath: outputPath,
        root: resolve(input),
        destRoot: resolve(output),
        vars: vars,
        log,
        copyFile,
        included,
    });

    writeFileSync(outputPath, result);

    if (changelogsSetting && changelogs?.length) {
        const mdFilename = basename(outputPath, extname(outputPath));
        const outputDir = dirname(outputPath);
        changelogs.forEach((changes, index) => {
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

            writeFileSync(
                changesPath,
                JSON.stringify({
                    ...changes,
                    source: mdFilename,
                }),
            );
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
    const {applyPresets, resolveConditions, conditionsInCode, useLegacyConditions} =
        ArgvService.getConfig();

    return liquid(input, vars, path, {
        conditions: resolveConditions,
        substitutions: applyPresets,
        conditionsInCode,
        withSourceMap: true,
        keepNotVar: true,
        useLegacyConditions,
    });
}

function transformMd2Md(input: string, options: PluginOptions) {
    const {disableLiquid, input: inputDir, changelogs: changelogsSetting, ...mdOptions} = ArgvService.getConfig();
    const plugins = PluginService.getPlugins();
    const {vars = {}, path, log: pluginLog} = options;

    const root = resolve(inputDir);
    const changelogs: ChangelogItem[] = [];

    let output = input;

    if (!disableLiquid) {
        const liquidResult = liquidMd2Md(input, vars, path);

        output = liquidResult.output;
    }

    output = transform.collect(output, {
        mdItInitOptions: {
            ...mdOptions,
            isLiquided: true,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            plugins: plugins as MarkdownItPluginCb<any>[],
            vars,
            root,
            path,
            assetsPublicPath: './',
            getVarsPerFile: getVarsPerRelativeFile,
            getPublicPath,
            extractTitle: true,
        },
        pluginCollectOptions: {
            ...options,
            vars,
            path,
            changelogs,
            extractChangelogs: Boolean(changelogsSetting),
        },
        parserPluginsOverride: MD2MD_PARSER_PLUGINS,
    });

    return {
        result: output,
        changelogs,
        logs: pluginLog.get(),
    };
}
