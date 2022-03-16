import {dirname, relative, resolve} from 'path';
import log from '@doc-tools/transform/lib/log';
import {
    default as yfmlint,
    LintMarkdownFunctionOptions,
    PluginOptions,
} from '@doc-tools/transform/lib/yfmlint';
import {readFileSync} from 'fs';

import {ArgvService, PluginService} from '../services';
import {getVarsPerFile, getVarsPerRelativeFile} from '../utils';
import {liquidMd2Html} from './md2html';
import {liquidMd2Md} from './md2md';

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
    const content: string = readFileSync(resolvedPath, 'utf8');

    const lintFn: Function = FileLinter[fileExtension];
    if (!lintFn) {
        return;
    }

    lintFn(content, {path: inputPath});

    if (onFinish) {
        onFinish();
    }
}

function MdFileLinter(content: string, lintOptions: FileTransformOptions): void {
    const {
        input,
        lintConfig,
        disableLiquid,
        outputFormat,
        ...options
    } = ArgvService.getConfig();
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
