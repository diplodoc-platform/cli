import {dirname, relative, resolve} from 'path';
import log from '@diplodoc/transform/lib/log';
import {
    default as yfmlint,
    LintMarkdownFunctionOptions,
    PluginOptions,
} from '@diplodoc/transform/lib/yfmlint';
import {readFileSync} from 'fs';
import {bold} from 'chalk';

import {ArgvService, PluginService} from '../services';
import {getVarsPerFileWithHash, getVarsPerRelativeFile, logger} from '../utils';
import {liquidMd2Html} from './md2html';
import {liquidMd2Md} from './md2md';
import {cacheServiceLint} from '../services/cache';
import PluginEnvApi from '../utils/pluginEnvApi';
import {checkLogWithoutProblems, getLogState} from '../services/utils';
import {LINT_CACHE_HIT} from '../constants';

interface FileTransformOptions {
    path: string;
    root?: string;
}

const FileLinter: Record<string, Function> = {
    '.md': MdFileLinter,
};

export interface ResolverLintOptions {
    inputPath: string;
    fileExtension: string;
    onFinish?: () => void;
}

export function lintPage(options: ResolverLintOptions) {
    const {inputPath, fileExtension, onFinish} = options;
    const {input} = ArgvService.getConfig();
    const resolvedPath: string = resolve(input, inputPath);

    try {
        const content: string = readFileSync(resolvedPath, 'utf8');

        const lintFn: Function = FileLinter[fileExtension];
        if (!lintFn) {
            return;
        }

        lintFn(content, {path: inputPath});
    } catch (e) {
        const message = `No such file or has no access to ${bold(resolvedPath)}`;
        console.error(message, e);
        log.error(message);
    }

    if (onFinish) {
        onFinish();
    }
}

function MdFileLinter(content: string, lintOptions: FileTransformOptions): void {
    const {input, lintConfig, disableLiquid, outputFormat, ...options} = ArgvService.getConfig();
    const {path: filePath} = lintOptions;

    const plugins = outputFormat === 'md' ? [] : PluginService.getPlugins();
    const {vars, varsHashList} = getVarsPerFileWithHash(filePath);
    const root = resolve(input);
    const path: string = resolve(input, filePath);
    let preparedContent = content;

    const cacheKey = cacheServiceLint.getHashKey({filename: filePath, content, varsHashList});

    const cachedFile = cacheServiceLint.checkFile(cacheKey);
    if (cachedFile) {
        logger.info(filePath, LINT_CACHE_HIT);
        return;
    }

    const cacheFile = cacheServiceLint.createFile(cacheKey);

    const envApi = PluginEnvApi.create({
        root,
        distRoot: '',
        cacheFile,
    });
    const logState = getLogState(log);

    /* Relative path from folder of .md file to root of user' output folder */
    const assetsPublicPath = relative(dirname(path), root);

    const lintMarkdown = function lintMarkdown(opts: LintMarkdownFunctionOptions) {
        const {input: localInput, path: localPath, sourceMap} = opts;

        const pluginOptions: PluginOptions = {
            ...options,
            vars,
            varsHashList,
            root,
            path: localPath,
            lintMarkdown, // Should pass the function for linting included files
            assetsPublicPath,
            disableLiquid,
            log,
            getVarsPerFile: getVarsPerRelativeFile,
            envApi,
        };

        yfmlint({
            input: localInput,
            lintConfig,
            pluginOptions,
            plugins,
            defaultLintConfig: PluginService.getDefaultLintConfig(),
            customLintRules: PluginService.getCustomLintRules(),
            sourceMap,
        });
    };

    let sourceMap;
    if (!disableLiquid) {
        let liquidResult;
        if (outputFormat === 'md') {
            liquidResult = liquidMd2Md(content, vars, path);
        } else {
            liquidResult = liquidMd2Html(content, vars, path);
        }

        preparedContent = liquidResult.output;
        sourceMap = liquidResult.sourceMap;
    }

    lintMarkdown({
        input: preparedContent,
        path,
        sourceMap,
    });

    const logIsOk = checkLogWithoutProblems(log, logState);
    if (logIsOk) {
        cacheServiceLint.addFile(cacheFile);
    }
}
