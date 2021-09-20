import {basename, dirname, join, relative, resolve} from 'path';
import {readFileSync, writeFileSync} from 'fs';
import yaml from 'js-yaml';

import transform, {Output} from '@doc-tools/transform';
import liquid from '@doc-tools/transform/lib/liquid';
import log from '@doc-tools/transform/lib/log';
import {
    default as yfmlint,
    LintMarkdownFunctionOptions,
    PluginOptions,
} from '@doc-tools/transform/lib/yfmlint';

import {ResolverOptions, YfmToc} from '../models';
import {ArgvService, PresetService, TocService, PluginService} from '../services';
import {generateStaticMarkup, logger, transformToc} from '../utils';
import {PROCESSING_FINISHED, Lang} from '../constants';
import {getUpdatedMetadata} from '../services/metadata';

export interface FileTransformOptions {
    path: string;
    root?: string;
}

const FileTransformer: Record<string, Function> = {
    '.yaml': YamlFileTransformer,
    '.md': MdFileTransformer,
};

export async function resolveMd2HTML(options: ResolverOptions): Promise<void> {
    const {inputPath, fileExtension, outputPath, outputBundlePath, metadata} = options;

    const pathToDir: string = dirname(inputPath);
    const toc: YfmToc|null = TocService.getForPath(inputPath) || null;
    const tocBase: string = toc && toc.base ? toc.base : '';
    const pathToFileDir: string = pathToDir === tocBase ? '' : pathToDir.replace(`${tocBase}/`, '');
    const relativePathToIndex = relative(dirname(inputPath), `${tocBase}/`);

    const {input, lang} = ArgvService.getConfig();
    const resolvedPath: string = resolve(input, inputPath);
    const content: string = readFileSync(resolvedPath, 'utf8');

    const transformFn: Function = FileTransformer[fileExtension];
    const {result} = transformFn(content, {path: inputPath});

    const updatedMetadata = metadata && metadata.isContributorsEnabled
        ? await getUpdatedMetadata(metadata, content, result?.meta)
        : result.meta;

    const props = {
        data: {
            leading: inputPath.endsWith('.yaml'),
            toc: transformToc(toc, pathToDir) || {},
            ...result,
            meta: updatedMetadata,
        },
        router: {
            pathname: join(relativePathToIndex, pathToFileDir, basename(outputPath)),
        },
        lang: lang || Lang.RU,
    };
    const outputDir = dirname(outputPath);
    const relativePathToBundle: string = relative(resolve(outputDir), resolve(outputBundlePath));

    const outputFileContent = generateStaticMarkup(props, relativePathToBundle);
    writeFileSync(outputPath, outputFileContent);
    logger.info(inputPath, PROCESSING_FINISHED);
}

function YamlFileTransformer(content: string): Object {
    let data = {};

    try {
        data = yaml.load(content) as string;
    } catch (error) {
        log.error(`Yaml transform has been failed. Error: ${error}`);
    }

    return {
        result: {data},
    };
}

function MdFileTransformer(content: string, transformOptions: FileTransformOptions): Output {
    const {input, vars: argVars, lintConfig, disableLint, disableLiquid, ...options} = ArgvService.getConfig();
    const {path: filePath} = transformOptions;

    const plugins = PluginService.getPlugins();
    const vars = {
        ...PresetService.get(dirname(filePath)),
        ...argVars,
    };
    const root = resolve(input);
    const path: string = resolve(input, filePath);
    let preparedContent = content;

    /* Relative path from folder of .md file to root of user' output folder */
    const assetsPublicPath = relative(dirname(path), resolve(input));

    if (!disableLint) {
        const lintMarkdown = function lintMarkdown(opts: LintMarkdownFunctionOptions) {
            const {input, path, sourceMap} = opts; // eslint-disable-line no-shadow

            const pluginOptions: PluginOptions = {
                ...options,
                vars,
                root,
                path,
                disableLint,
                lintMarkdown, // Should pass the function for linting included files
                assetsPublicPath,
                log,
            };

            yfmlint({
                input,
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
            const liquidResult = liquid(content, vars, path, {withSourceMap: true});

            preparedContent = liquidResult.output;
            sourceMap = liquidResult.sourceMap;
        }

        lintMarkdown({
            input: preparedContent,
            path,
            sourceMap,
        });
    }

    return transform(preparedContent, {
        ...options,
        plugins,
        vars,
        root,
        path,
        assetsPublicPath,
        disableLiquid: true,
    });
}
