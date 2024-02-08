import {ok} from 'assert';
import glob from 'glob';
import {argvValidator} from '../../validator';

const {
    promises: {readFile, writeFile, mkdir},
} = require('fs');
import {basename, dirname, join, resolve} from 'path';

// @ts-ignore
import {ExtractParams, extract as extractMD} from '@diplodoc/markdown-translation';
import {Arguments, Argv} from 'yargs';
import {asyncify, eachLimit} from 'async';

import {ArgvService} from '../../services';

const command = 'extract';

const description = 'extract xliff and skeleton from yfm documentation';

const extract = {command, description, handler, builder};

const MAX_CONCURRENCY = 50;

function builder<T>(argv: Argv<T>) {
    return argv
        .option('source-language-locale', {
            alias: 'sll',
            describe: 'source language and locale',
            type: 'string',
        })
        .option('target-language-locale', {
            alias: 'tll',
            describe: 'target language and locale',
            type: 'string',
        })
        .option('input', {
            alias: 'i',
            describe: 'input folder with markdown files',
            type: 'string',
        })
        .option('output', {
            alias: 'o',
            describe: 'output folder to store xliff and skeleton files',
            type: 'string',
        })
        .check(argvValidator);
}

type HandlerParams = {
    input: string;
    output: string;
    include?: string[];
    exclude?: string[];
    sourceLanguage?: string;
    sourceLocale?: string;
    sourceLanguageLocale?: string;
    targetLanguage?: string;
    targetLocale?: string;
    targetLanguageLocale?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handler(args: Arguments<HandlerParams>) {
    args = Object.assign({}, args.translate || {}, args);
    delete args.translate;

    ArgvService.init({
        ...args,
    });

    const {
        output,
        exclude = [],
        sourceLanguage,
        sourceLocale,
        targetLanguage,
        targetLocale,
    } = ArgvService.getConfig() as HandlerParams;

    let {
        input,
        include = [],
        sourceLanguageLocale,
        targetLanguageLocale,
    } = ArgvService.getConfig() as HandlerParams;

    ok(input);
    ok(output);

    ok(
        sourceLanguageLocale || (sourceLanguage && sourceLocale),
        'Source language and locale should be configured',
    );

    ok(
        targetLanguageLocale || (targetLanguage && targetLocale),
        'Source language and locale should be configured',
    );

    sourceLanguageLocale = sourceLanguageLocale || sourceLanguage + '-' + sourceLocale;
    targetLanguageLocale = targetLanguageLocale || targetLanguage + '-' + targetLocale;

    const source = parseLanguageLocale(sourceLanguageLocale);
    const target = parseLanguageLocale(targetLanguageLocale);

    if (input.endsWith('.md')) {
        include = [basename(input)];
        input = dirname(input);
    } else if (!include.length) {
        include.push('**/*');
    }

    const files = ([] as string[]).concat(
        ...include.map((match) =>
            glob.sync(match, {
                cwd: join(input, source.language),
                ignore: exclude,
            }),
        ),
    );
    const found = [...new Set(files)];
    const configuredPipeline = pipeline({source, target, input, output});

    await eachLimit(found, MAX_CONCURRENCY, asyncify(configuredPipeline));
}

function parseLanguageLocale(languageLocale: string) {
    const [language, locale] = languageLocale.split('-');
    if (!language?.length || !locale?.length) {
        throw new Error('invalid language-locale string');
    }

    return {language, locale};
}

export type PipelineParameters = {
    input: string;
    output: string;
    source: ExtractParams['source'];
    target: ExtractParams['target'];
};

function pipeline(params: PipelineParameters) {
    const {input, output, source, target} = params;
    const inputRoot = resolve(input, source.language);
    const outputRoot = resolve(output, target.language);

    return async (path: string) => {
        if (!path.endsWith('.md')) {
            return;
        }

        const inputPath = join(inputRoot, path);
        const xliffPath = join(outputRoot, path + '.xliff');
        const skeletonPath = join(outputRoot, path + '.skl');
        const markdown = await readFile(inputPath, 'utf-8');

        await mkdir(dirname(xliffPath), {recursive: true});

        const {xliff, skeleton} = await extractMD({
            markdownPath: path,
            skeletonPath,
            markdown,
            source,
            target,
        });

        await Promise.all([writeFile(skeletonPath, skeleton), writeFile(xliffPath, xliff)]);
    };
}

export {extract};

export default {extract};
