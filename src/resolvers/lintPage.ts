import {dirname, relative, resolve} from 'path';
import {load} from 'js-yaml';
import log, {LogLevels} from '@diplodoc/transform/lib/log';
import {
    LintMarkdownFunctionOptions,
    PluginOptions,
    default as yfmlint,
} from '@diplodoc/transform/lib/yfmlint';
import {isLocalUrl} from '@diplodoc/transform/lib/utils';
import {getLogLevel} from '@diplodoc/transform/lib/yfmlint/utils';
import {LINK_KEYS} from '@diplodoc/client/ssr';

import {readFileSync} from 'fs';
import {bold} from 'chalk';

import {ArgvService, PluginService} from '../services';
import {
    checkPathExists,
    findAllValuesByKeys,
    getLinksWithExtension,
    getVarsPerFile,
    getVarsPerRelativeFile,
} from '../utils';
import {liquidMd2Html} from './md2html';
import {liquidMd2Md} from './md2md';

interface FileTransformOptions {
    path: string;
    root?: string;
}

const FileLinter: Record<string, Function> = {
    '.md': MdFileLinter,
    '.yaml': YamlFileLinter,
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

function YamlFileLinter(content: string, lintOptions: FileTransformOptions): void {
    const {input, lintConfig} = ArgvService.getConfig();
    const {path: filePath} = lintOptions;
    const currentFilePath: string = resolve(input, filePath);

    const logLevel = getLogLevel({
        logLevelsConfig: lintConfig['log-levels'],
        ruleNames: ['YAML001'],
        defaultLevel: log.LogLevels.ERROR,
    });

    const contentLinks = findAllValuesByKeys(load(content) as object, LINK_KEYS);
    const localLinks = contentLinks.filter(
        (link) => getLinksWithExtension(link) && isLocalUrl(link),
    );

    const loggerForLogLevel = logLevel === LogLevels.DISABLED ? () => undefined : log[logLevel];

    return localLinks.forEach(
        (link) =>
            checkPathExists(link, currentFilePath) ||
            loggerForLogLevel(`Link is unreachable: ${bold(link)} in ${bold(currentFilePath)}`),
    );
}

function MdFileLinter(content: string, lintOptions: FileTransformOptions): void {
    const {input, lintConfig, disableLiquid, outputFormat, ...options} = ArgvService.getConfig();
    const {path: filePath} = lintOptions;

    const plugins = outputFormat === 'md' ? [] : PluginService.getPlugins();
    const vars = getVarsPerFile(filePath);
    const root = resolve(input);
    const path: string = resolve(input, filePath);
    let preparedContent = content;

    /* Relative path from folder of .md file to root of user' output folder */
    const assetsPublicPath = relative(dirname(path), root);

    const lintMarkdown = function lintMarkdown(opts: LintMarkdownFunctionOptions) {
        const {input: localInput, path: localPath, sourceMap} = opts;

        const pluginOptions: PluginOptions = {
            ...options,
            vars,
            root,
            path: localPath,
            lintMarkdown, // Should pass the function for linting included files
            assetsPublicPath,
            disableLiquid,
            log,
            getVarsPerFile: getVarsPerRelativeFile,
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
}
