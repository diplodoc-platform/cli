import {ok} from 'assert';
import {argvValidator} from '../../validator';
import glob from 'glob';

const {
    promises: {readFile, writeFile, mkdir},
} = require('fs');
import {dirname, join} from 'path';

// @ts-ignore
import {ComposeParams, compose as composeMD} from '@diplodoc/markdown-translation';
import {Arguments, Argv} from 'yargs';
import {eachLimit} from 'async';

import {ArgvService} from '../../services';

const command = 'compose';

const description = 'compose xliff and skeleton into documentation';

const compose = {command, description, handler, builder};

const MAX_CONCURRENCY = 50;

function builder<T>(argv: Argv<T>) {
    return argv
        .option('input', {
            alias: 'i',
            describe: 'input folder with xliff and skeleton files',
            type: 'string',
        })
        .option('output', {
            alias: 'o',
            describe: 'output folder where translated markdown will be stored',
            type: 'string',
        })
        .option('target-language', {
            alias: 'tl',
            describe: 'target language',
            type: 'string',
        })
        .option('use-source', {
            describe: 'for debug',
            type: 'boolean',
        })
        .check(argvValidator);
}

type HandlerParams = {
    input: string;
    output: string;
    targetLanguage: string;
    exclude?: string[];
    useSource?: boolean;
};

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
async function handler(args: Arguments<HandlerParams>) {
    args = Object.assign({}, args.translate || {}, args);
    delete args.translate;

    ArgvService.init({
        ...args,
    });

    const {
        input,
        output,
        exclude = [],
        targetLanguage,
        useSource = false,
    } = ArgvService.getConfig() as unknown as HandlerParams;

    ok(input);
    ok(output);
    ok(targetLanguage);

    const skeletons = glob.sync('**/*.skl', {
        cwd: join(input, targetLanguage),
        ignore: exclude,
    });
    const xliffs = glob.sync('**/*.xliff', {
        cwd: join(input, targetLanguage),
        ignore: exclude,
    });

    ok(xliffs.length === skeletons.length, 'Inconsistent number of xliff and skeleton files.');

    const pipelineParameters = {input, output, targetLanguage, useSource};
    const configuredPipeline = pipeline(pipelineParameters);

    await eachLimit(skeletons, MAX_CONCURRENCY, configuredPipeline);
}

export type PipelineParameters = ComposeParams;

function pipeline(params: PipelineParameters) {
    const {input, output, targetLanguage, useSource} = params;

    return async (skeletonPath: string) => {
        const fileName = skeletonPath.split('.').slice(0, -1).join('.');
        const xliffPath = fileName + '.xliff';

        const [skeleton, xliff] = await Promise.all<string[]>([
            readFile(join(input, targetLanguage, skeletonPath), 'utf-8'),
            readFile(join(input, targetLanguage, xliffPath), 'utf-8'),
        ]);
        const markdown = composeMD({
            skeleton,
            xliff,
            skeletonPath,
            xliffPath,
            useSource,
        });

        const markdownPath = join(output, targetLanguage, fileName);

        await mkdir(dirname(markdownPath), {recursive: true});
        await writeFile(markdownPath, markdown);
    };
}

export {compose};

export default {compose};
