const {promises: {readFile, writeFile, mkdir}} = require('fs');
import {join, dirname, extname} from 'path';

import markdownTranslation, {ExtractParameters} from '@diplodoc/markdown-translation';
import {Arguments, Argv} from 'yargs';
import {eachLimit, asyncify} from 'async';

import {ArgvService} from '../../services';
import {glob, logger} from '../../utils';

const command = 'extract';

const description = 'extract xliff and skeleton from yfm documentation';

const extract = {command, description, handler, builder};

const MD_GLOB = '**/*.md';

const MAX_CONCURRENCY = 50;

class ExtractError extends Error {
    path: string;

    constructor(message: string, path: string) {
        super(message);

        this.path = path;
    }
}

const USAGE = `yfm xliff extract \
--input <folder-with-markdown> \
--output <folder-to-store-xlff-and-skeleton> \
--sll <source-language>-<source-locale> \
--tll <target-language>-<target-locale>

where <source/target-language> is the language code, as described in ISO 639-1.

where <source/target-locale> is the locale code in alpha-2 format, as described in ISO 3166-1`;

function builder<T>(argv: Argv<T>) {
    return argv
        .option('source-language-locale', {
            alias: 'sll',
            describe: 'source language and locale',
            type: 'string',
        }).option('target-language-locale', {
            alias: 'tll',
            describe: 'target language and locale',
            type: 'string',
        }).option('input', {
            alias: 'i',
            describe: 'input folder with markdown files',
            type: 'string',
        }).option('output', {
            alias: 'o',
            describe: 'output folder to store xliff and skeleton files',
            type: 'string',
        }).demandOption(['source-language-locale', 'target-language-locale', 'input', 'output'], USAGE);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handler(args: Arguments<any>) {
    ArgvService.init({
        ...args,
    });

    const {input, output, sourceLanguageLocale, targetLanguageLocale} = args;

    let source;
    let target;

    try {
        source = parseLanguageLocale(sourceLanguageLocale);
        target = parseLanguageLocale(targetLanguageLocale);
    } catch (err) {
        if (err instanceof Error) {
            logger.error(input, err.message);
        }
    }

    let cache = {};
    let found: string[] = [];

    try {
        ({state: {found, cache}} = await glob(join(input, MD_GLOB), {
            nosort: true,
            cache,
        }));
    } catch (err) {
        if (err instanceof Error) {
            logger.error(input, err.message);
        }
    }

    const pipelineParameters = {source, target, input, output};
    const configuredPipeline = pipeline(pipelineParameters);

    try {
        logger.info(input, 'starting xliff and skeleton generation pipeline');

        await eachLimit(found, MAX_CONCURRENCY, asyncify(configuredPipeline));

        logger.info(input, 'finished xliff and skeleton generation pipeline');
    } catch (err) {
        if (err instanceof Error || err instanceof ExtractError) {
            const file = err instanceof ExtractError ? err.path : input;

            logger.error(file, err.message);
        }
    }
}

function parseLanguageLocale(languageLocale: string) {
    const [language, locale] = languageLocale.split('-');
    if (language?.length && locale?.length) {
        return {language, locale};
    }

    throw new Error('invalid language-locale string');
}

export type PipelineParameters = {
    input: string;
    output: string;
    source: ExtractParameters['source'];
    target: ExtractParameters['target'];
};

function pipeline(params: PipelineParameters) {
    const {input, output, source, target} = params;

    return async (markdownPath: string) => {
        const markdown = await reader({path: markdownPath});
        const extension = extname(markdownPath);

        const outputRelativePath = markdownPath
            .replace(extension, '')
            .slice(input.length);

        const outputPath = join(output, outputRelativePath);
        const xlfPath = outputPath + '.xliff';
        const skeletonPath = outputPath + '.skl.md';

        const extractParameters = {
            markdownPath,
            skeletonPath,
            markdown,
            source,
            target,
        };

        const extracted = await extractor(extractParameters);

        const writerParameters = {
            ...extracted,
            xlfPath,
            skeletonPath,
        };

        await writer(writerParameters);
    };
}

export type ReaderParameters = {
    path: string;
};

async function reader(params: ReaderParameters) {
    const {path} = params;

    let markdown;
    try {
        logger.info(path, 'reading markdown file');

        markdown = await readFile(path, {encoding: 'utf-8'});

        logger.info(path, 'finished reading markdown file');
    } catch (err) {
        if (err instanceof Error) {
            throw new ExtractError(err.message, path);
        }
    }

    return markdown;
}

export type ExtractorParameters = {
    source: ExtractParameters['source'];
    target: ExtractParameters['target'];
    skeletonPath: string;
    markdownPath: string;
    markdown: string;
};

async function extractor(params: ExtractorParameters) {
    let extracted;

    logger.info(params.markdownPath, 'generating skeleton and xliff from markdown');

    try {
        extracted = markdownTranslation.extract(params);
    } catch (err) {
        if (err instanceof Error) {
            throw new ExtractError(err.message, params.markdownPath);
        }
    }

    logger.info(params.markdownPath, 'finished generating skeleton and xliff from markdown');

    return extracted;
}

export type WriterParameters = {
    skeletonPath: string;
    skeleton: string;
    xlfPath: string;
    xlf: string;
};

async function writer(params: WriterParameters) {
    const {xlfPath, skeletonPath, xlf, skeleton} = params;

    logger.info(params.xlfPath, 'writing xliff file');
    logger.info(params.skeletonPath, 'writing skeleton file');

    await mkdir(dirname(xlfPath), {recursive: true});

    await Promise.all([writeFile(skeletonPath, skeleton), writeFile(xlfPath, xlf)]);

    logger.info(params.xlfPath, 'finished writing xliff file');
    logger.info(params.skeletonPath, 'finished writing skeleton file');
}

export {extract};

export default {extract};
