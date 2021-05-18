import {readFileSync, writeFileSync} from 'fs';
import {dirname, resolve} from 'path';
import shell from 'shelljs';
import log, {Logger} from '@doc-tools/transform/lib/log';
import liquid from '@doc-tools/transform/lib/liquid';
import {
    LintRuleParams,
    LintRuleFunction,
} from '@doc-tools/transform/lib/lintRules/models';

import {ArgvService, PresetService} from '../services';
import {getPlugins, logger} from '../utils';
import {ResolveMd2MdOptions} from '../models';
import {PROCESSING_HAS_BEEN_FINISHED, YFM_PREPROCESS_LINT_RULES} from '../constants';
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
    lintMarkdown?: (params: LintRuleParams) => void;
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

    const lintMarkdown = makeLintMarkdown(YFM_PREPROCESS_LINT_RULES);

    const plugins = getPlugins();
    const collectOfPlugins = makeCollectOfPlugins(plugins);

    const {result} = transformMd2Md(content, {
        path: resolvedInputPath,
        destPath: outputPath,
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
        lintMarkdown,
    });

    writeFileSync(outputPath, result);
    logger.info(inputPath, PROCESSING_HAS_BEEN_FINISHED);
}

function makeLintMarkdown(lintRules: LintRuleFunction[]) {
    return (params: LintRuleParams) => {
        lintRules.forEach((lintRule) => {
            lintRule(params);
        });
    };
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
    const {applyPresets, resolveConditions, disableLiquid, lintOptions, disableLint} = ArgvService.getConfig();
    const {vars = {}, path, root, destPath, destRoot, collectOfPlugins, lintMarkdown, log, copyFile, singlePage} = options;

    if (lintMarkdown && !disableLint) {
        lintMarkdown({input, lintOptions, commonOptions: {log, path}});
    }

    let output = disableLiquid ? input : liquid(input, {
        vars,
        path,
        conditions: resolveConditions,
        substitutions: applyPresets,
        lintOptions,
        disableLint,
    });

    if (collectOfPlugins) {
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
