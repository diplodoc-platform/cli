import {dirname, relative, resolve} from 'path';
import {load} from 'js-yaml';
import log from '@diplodoc/transform/lib/log';
import {
    LintMarkdownFunctionOptions,
    PluginOptions,
    default as yfmlint,
} from '@diplodoc/transform/lib/yfmlint';
import {isLocalUrl} from '@diplodoc/transform/lib/utils';
import {getLogLevel} from '@diplodoc/transform/lib/yfmlint/utils';
import {LINK_KEYS} from '@diplodoc/client/ssr';

import {bold} from 'chalk';

import {FsContext} from '@diplodoc/transform/lib/typings';
import {ArgvService, PluginService} from '~/services';
import {RevisionContext} from '~/context/context';
import {FsContextCli} from '~/context/fs';
import {
    checkPathExists,
    findAllValuesByKeys,
    getLinksWithExtension,
    getVarsPerFile,
    getVarsPerRelativeFile,
} from '~/utils';
import {liquidMd2Html} from './md2html';
import {liquidMd2Md} from './md2md';

interface FileTransformOptions {
    path: string;
    root?: string;
    context: RevisionContext;
    fs: FsContext;
}

const FileLinter: Record<string, Function> = {
    '.md': MdFileLinter,
    '.yaml': YamlFileLinter,
};

export interface ResolverLintOptions {
    inputPath: string;
    fileExtension: string;
    onFinish?: () => void;
    context: RevisionContext;
}

export async function lintPage(options: ResolverLintOptions) {
    const {inputPath, fileExtension, onFinish, context} = options;
    const {input} = ArgvService.getConfig();
    const resolvedPath: string = resolve(input, inputPath);
    const fs = new FsContextCli(context);

    try {
        const content: string = await fs.readAsync(resolvedPath);

        const lintFn: Function = FileLinter[fileExtension];
        if (!lintFn) {
            return;
        }

        await lintFn(content, {path: inputPath, fs, context});
    } catch (e) {
        const message = `No such file or has no access to ${bold(resolvedPath)}`;
        console.error(message, e);
        log.error(message);
    }

    if (onFinish) {
        onFinish();
    }
}

async function YamlFileLinter(content: string, lintOptions: FileTransformOptions): Promise<void> {
    const {input, lintConfig} = ArgvService.getConfig();
    const {path: filePath} = lintOptions;
    const currentFilePath: string = resolve(input, filePath);

    const logLevel = getLogLevel({
        logLevelsConfig: lintConfig['log-levels'],
        ruleNames: ['YAML001'],
        defaultLevel: log.LogLevels.ERROR,
    });

    const data = load(content) as object;
    const contentLinks: string[] = findAllValuesByKeys(data, LINK_KEYS);
    const localLinks = contentLinks.filter(
        (link) => getLinksWithExtension(link) && isLocalUrl(link),
    );

    await Promise.all(
        localLinks.map(
            async (link) =>
                (await checkPathExists(lintOptions.fs, link, currentFilePath)) ||
                log[logLevel](`Link is unreachable: ${bold(link)} in ${bold(currentFilePath)}`),
        ),
    );
}

async function MdFileLinter(content: string, lintOptions: FileTransformOptions): Promise<void> {
    const {input, lintConfig, disableLiquid, outputFormat, ...options} = ArgvService.getConfig();
    const {path: filePath, fs} = lintOptions;

    const plugins = outputFormat === 'md' ? [] : PluginService.getPlugins();
    const vars = getVarsPerFile(filePath);
    const root = resolve(input);
    const path: string = resolve(input, filePath);
    let preparedContent = content;

    /* Relative path from folder of .md file to root of user' output folder */
    const assetsPublicPath = relative(dirname(path), root);

    const lintMarkdown = async function lintMarkdown(opts: LintMarkdownFunctionOptions) {
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
            fs,
        };

        await yfmlint({
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
            liquidResult = await liquidMd2Md(content, vars, path);
        } else {
            liquidResult = await liquidMd2Html(content, vars, path);
        }

        preparedContent = liquidResult.output;
        sourceMap = liquidResult.sourceMap;
    }

    await lintMarkdown({
        input: preparedContent,
        path,
        sourceMap,
    });
}
