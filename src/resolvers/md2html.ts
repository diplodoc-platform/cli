import {basename, dirname, join, relative, resolve} from 'path';
import {readFileSync, writeFileSync} from 'fs';
import yaml from 'js-yaml';

import transform, {Output} from '@doc-tools/transform';
import log from '@doc-tools/transform/lib/log';

import {ResolverOptions, YfmToc} from '../models';
import {ArgvService, PresetService, TocService} from '../services';
import {generateStaticMarkup, getPlugins, logger, transformToc} from '../utils';
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
    const {input, vars, ...options} = ArgvService.getConfig();
    const {path} = transformOptions;
    const resolvedPath: string = resolve(input, path);

    /* Relative path from folder of .md file to root of user' output folder */
    const assetsPublicPath = relative(dirname(resolvedPath), resolve(input));

    return transform(content, {
        ...options,
        plugins: getPlugins(),
        vars: {
            ...PresetService.get(dirname(path)),
            ...vars,
        },
        root: resolve(input),
        path: resolvedPath,
        assetsPublicPath,
    });
}
