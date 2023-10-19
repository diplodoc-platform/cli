import * as fs from 'fs';
import {dirname, resolve, join, basename, extname, relative} from 'path';
import shell from 'shelljs';
import log, {LogLevels} from '@diplodoc/transform/lib/log';
import liquid from '@diplodoc/transform/lib/liquid';

import {ArgvService, PluginService} from '../services';
import {logger, getVarsPerFileWithHash} from '../utils';
import {PluginOptions, ResolveMd2MdOptions} from '../models';
import {CACHE_HIT, PROCESSING_FINISHED} from '../constants';
import {getContentWithUpdatedMetadata} from '../services/metadata';
import {ChangelogItem} from '@diplodoc/transform/lib/plugins/changelog/types';
import {cacheServiceBuildMd} from '../services/cache';
import PluginEnvApi from '../utils/pluginEnvApi';
import {checkLogWithoutProblems, getLogState} from '../services/utils';

export async function resolveMd2Md(options: ResolveMd2MdOptions): Promise<void> {
    const {inputPath, outputPath, metadata} = options;
    const {input, output} = ArgvService.getConfig();
    const resolvedInputPath = resolve(input, inputPath);
    const {vars, varsHashList} = getVarsPerFileWithHash(inputPath);

    const rawContent = fs.readFileSync(resolvedInputPath, 'utf8');

    const cacheKey = cacheServiceBuildMd.getHashKey({
        filename: inputPath,
        content: rawContent,
        varsHashList,
    });

    let result: string;
    let changelogs: ChangelogItem[];

    const cachedFile = await cacheServiceBuildMd.checkFileAsync(cacheKey);
    if (cachedFile) {
        logger.info(inputPath, CACHE_HIT);
        await cachedFile.extractCacheAsync();
        const results = cachedFile.getResult<{
            result: string;
            changelogs: ChangelogItem[];
            logs: Record<LogLevels, string[]>;
        }>();
        result = results.result;
        changelogs = results.changelogs;
    } else {
        const content = await getContentWithUpdatedMetadata(rawContent, metadata, vars.__system);

        const cacheFile = cacheServiceBuildMd.createFile(cacheKey);
        const envApi = PluginEnvApi.create({
            root: resolve(input),
            distRoot: resolve(output),
            cacheFile,
        });
        const logState = getLogState(log);

        const transformResult = transformMd2Md(content, {
            path: resolvedInputPath,
            destPath: outputPath,
            root: resolve(input),
            destRoot: resolve(output),
            collectOfPlugins: PluginService.getCollectOfPlugins(),
            vars,
            log,
            copyFile,
            envApi,
        });

        result = transformResult.result;
        changelogs = transformResult.changelogs;

        envApi.executeActions();

        const logIsOk = checkLogWithoutProblems(log, logState);
        if (logIsOk) {
            cacheFile.setResult(transformResult);
            // not async cause race condition
            cacheServiceBuildMd.addFile(cacheFile);
        }
    }

    fs.writeFileSync(outputPath, result);

    if (changelogs?.length) {
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

            const changesPath = join(outputDir, `changes-${changesName}.json`);

            if (fs.existsSync(changesPath)) {
                throw new Error(`Changelog ${changesPath} already exists!`);
            }

            fs.writeFileSync(
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
    if (options) {
        const {envApi} = options;
        let sourceIncludeContent: string;
        if (envApi) {
            sourceIncludeContent = envApi.readFile(
                relative(envApi.root, targetPath),
                'utf-8',
            ) as string;
        } else {
            sourceIncludeContent = fs.readFileSync(targetPath, 'utf8');
        }

        const {result} = transformMd2Md(sourceIncludeContent, options);

        if (envApi) {
            envApi.writeFileAsync(relative(envApi.distRoot, targetDestPath), result);
        } else {
            fs.mkdirSync(dirname(targetDestPath), {recursive: true});
            fs.writeFileSync(targetDestPath, result);
        }
    } else {
        fs.mkdirSync(dirname(targetDestPath), {recursive: true});
        shell.cp(targetPath, targetDestPath);
    }
}

export function liquidMd2Md(input: string, vars: Record<string, unknown>, path: string) {
    const {applyPresets, resolveConditions, conditionsInCode} = ArgvService.getConfig();

    return liquid(input, vars, path, {
        conditions: resolveConditions,
        substitutions: applyPresets,
        conditionsInCode,
        withSourceMap: true,
        keepNotVar: true,
    });
}

function transformMd2Md(input: string, options: PluginOptions) {
    const {disableLiquid} = ArgvService.getConfig();
    const {
        vars = {},
        path,
        root,
        destPath,
        destRoot,
        collectOfPlugins,
        log: pluginLog,
        copyFile: pluginCopyFile,
        envApi,
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
            extractChangelogs: true,
            envApi,
        });
    }

    return {
        result: output,
        changelogs,
        logs: pluginLog.get(),
    };
}
