const {promises: {readFile, writeFile, mkdir}} = require('fs');
import {join, extname, dirname} from 'path';

import markdownTranslation, {ComposeParameters} from '@diplodoc/markdown-translation';
import {Arguments, Argv} from 'yargs';
import {eachLimit} from 'async';

import {ArgvService} from '../../services';
import {glob, logger} from '../../utils';

const command = 'compose';

const description = 'compose xliff and skeleton into documentation';

const compose = {command, description, handler, builder};

const SKL_MD_GLOB = '**/*.skl.md';
const XLF_GLOB = '**/*.xliff';
const MAX_CONCURRENCY = 50;

class ComposeError extends Error {
    path: string;

    constructor(message: string, path: string) {
        super(message);

        this.path = path;
    }
}

const USAGE = 'yfm xliff compose \
--input <folder-with-xliff-and-skeleton> \
--ouput <folder-to-store-translated-markdown>';

function builder<T>(argv: Argv<T>) {
    return argv
        .option('input', {
            alias: 'i',
            describe: 'input folder with xliff and skeleton files',
            type: 'string',
        }).option('output', {
            alias: 'o',
            describe: 'output folder where translated markdown will be stored',
            type: 'string',
        }).demandOption(['input', 'output'], USAGE);
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
async function handler(args: Arguments<any>) {
    ArgvService.init({
        ...args,
    });

    const {input, output} = args;

    let cache = {};
    let skeletonPaths: string[] = [];
    let xliffPaths: string[] = [];

    try {
        ({state: {found: skeletonPaths, cache}} = await glob(join(input, SKL_MD_GLOB), {
            nosort: false,
            cache,
        }));

        ({state: {found: xliffPaths, cache}} = await glob(join(input, XLF_GLOB), {
            nosort: false,
            cache,
        }));

        if (xliffPaths.length !== skeletonPaths.length) {
            throw new ComposeError('number of xliff and skeleton files does\'not match', input);
        }
    } catch (err) {
        if (err instanceof Error || err instanceof ComposeError) {
            const file = err instanceof ComposeError ? err.path : input;

            logger.error(file, err.message);
        }
    }

    const pipelineParameters = {input, output};
    const configuredPipeline = pipeline(pipelineParameters);

    try {
        logger.info(input, 'staring translated markdown composition pipeline');

        await eachLimit(xliffPaths, MAX_CONCURRENCY, configuredPipeline);

        logger.info(input, 'finished translated markdown composition pipeline');
    } catch (err) {
        if (err instanceof Error || err instanceof ComposeError) {
            const file = err instanceof ComposeError ? err.path : input;

            logger.error(file, err.message);
        }
    }
}

export type PipelineParameters = {
    input: string;
    output: string;
};

function pipeline(params: PipelineParameters) {
    const {input, output} = params;

    return async (xliffPath: string) => {
        const extension = extname(xliffPath);
        const extensionLessPath = xliffPath.replace(extension, '');
        const skeletonPath = extensionLessPath + '.skl.md';

        const readerParameters = {xliffPath, skeletonPath};
        const read = await reader(readerParameters);

        const composerParameters = {
            ...read,
            skeletonPath,
            xliffPath,
        };
        const {markdown} = await composer(composerParameters);

        const inputRelativePath = extensionLessPath.slice(input.length);
        const markdownPath = join(output, inputRelativePath) + '.md';

        const writerParameters = {
            markdown,
            markdownPath,
        };
        await writer(writerParameters);
    };
}

export type ReaderParameters = {
    skeletonPath: string;
    xliffPath: string;
};

async function reader(params: ReaderParameters) {
    const {skeletonPath, xliffPath} = params;

    let skeleton;
    let xlf;

    try {
        logger.info(skeletonPath, 'reading skeleton file');

        skeleton = await readFile(skeletonPath, {encoding: 'utf-8'});

        logger.info(skeletonPath, 'finished reading skeleton file');
    } catch (err) {
        if (err instanceof Error) {
            throw new ComposeError(err.message, skeletonPath);
        }
    }

    try {
        logger.info(xliffPath, 'reading xliff file');

        xlf = await readFile(xliffPath, {encoding: 'utf-8'});

        logger.info(xliffPath, 'finished reading xliff file');
    } catch (err) {
        if (err instanceof Error) {
            throw new ComposeError(err.message, xliffPath);
        }
    }

    return {skeleton, xlf};
}

export type ComposerParameters = {
    skeletonPath: string;
    xliffPath: string;
} & ComposeParameters;

async function composer(params: ComposerParameters) {
    const {skeletonPath, xliffPath} = params;
    let markdown;

    try {
        logger.info(skeletonPath, 'composing markdown from xliff and skeleton');
        logger.info(xliffPath, 'composing markdown from xliff and skeleton');

        markdown = markdownTranslation.compose(params);

        logger.info(skeletonPath, 'finished composing markdown from xliff and skeleton');
        logger.info(xliffPath, 'finished composing markdown from xliff and skeleton');
    } catch (err) {
        if (err instanceof Error) {
            throw new ComposeError(err.message, `${xliffPath} ${skeletonPath}`);
        }
    }

    return {markdown};
}

export type WriterParameters = {
    markdown: string;
    markdownPath: string;
};

async function writer(params: WriterParameters) {
    const {markdown, markdownPath} = params;

    try {
        logger.info(markdownPath, 'writing markdown file');

        await mkdir(dirname(markdownPath), {recursive: true});
        await writeFile(markdownPath, markdown);

        logger.info(markdownPath, 'finished writing markdown file');
    } catch (err) {
        if (err instanceof Error) {
            throw new ComposeError(err.message, markdownPath);
        }
    }
}

export {compose};

export default {compose};
