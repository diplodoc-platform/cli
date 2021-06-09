import {basename, dirname, join, relative, resolve} from 'path';
import {readFileSync, writeFileSync} from 'fs';
import yaml from 'js-yaml';

import transform, {Output} from '@doc-tools/transform';
import log from '@doc-tools/transform/lib/log';
import {
    default as yfmlint,
    PluginOptions,
} from '@doc-tools/transform/lib/yfmlint';

import {ResolverOptions, YfmToc} from '../models';
import {ArgvService, PresetService, TocService} from '../services';
import {generateStaticMarkup, getPlugins, getCustomLintRules, logger, transformToc} from '../utils';
import {PROCESSING_HAS_BEEN_FINISHED, Lang} from '../constants';
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

    const {input} = ArgvService.getConfig();
    const resolvedPath: string = resolve(input, inputPath);
    const content: string = readFileSync(resolvedPath, 'utf8');

    const transformFn: Function = FileTransformer[fileExtension];
    const {result} = transformFn(content, {path: inputPath});

    const updatedMetadata = metadata && metadata.isContributorsEnabled
        ? await getUpdatedMetadata(result, metadata, content)
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
        // TODO(vladimirfedin): CLOUDFRONT-3939
        lang: Lang.RU,
    };
    const outputDir = dirname(outputPath);
    const relativePathToBundle: string = relative(resolve(outputDir), resolve(outputBundlePath));

    const outputFileContent = generateStaticMarkup(props, relativePathToBundle);
    writeFileSync(outputPath, outputFileContent);
    logger.info(inputPath, PROCESSING_HAS_BEEN_FINISHED);
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
    const {input, vars: argVars, lintConfig, disableLint, ...options} = ArgvService.getConfig();
    const {path: filePath} = transformOptions;

    const plugins = getPlugins();
    const vars = {
        ...PresetService.get(dirname(filePath)),
        ...argVars,
    };
    const root = resolve(input);
    const path: string = resolve(input, filePath);

    /* Relative path from folder of .md file to root of user' output folder */
    const assetsPublicPath = relative(dirname(path), resolve(input));

    if (!disableLint) {
        const pluginOptions: PluginOptions = {
            ...options,
            vars,
            root,
            path,
            assetsPublicPath,
            log,
        };

        yfmlint({
            input: content,
            lintConfig,
            pluginOptions,
            plugins,
            customLintRules: getCustomLintRules(),
        });
    }

    return transform(content, {
        ...options,
        plugins,
        vars,
        root,
        path,
        assetsPublicPath,
    });
}
