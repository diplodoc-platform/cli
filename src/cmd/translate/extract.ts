import {ok} from 'assert';
import {mkdir} from 'node:fs/promises';
import {dirname, extname, join, resolve} from 'path';
import {Arguments, Argv} from 'yargs';
import {asyncify, eachLimit} from 'async';
import {ExtractOptions, extract as _extract} from '@diplodoc/translation';

import {ArgvService} from '../../services';
import {argvValidator} from '../../validator';
import {TranslateParams, dumpFile, loadFile, normalizeParams, resolveSchemas} from './utils';

const command = 'extract';

const description = 'extract xliff and skeleton from yfm documentation';

const extract = {command, description, handler, builder};

const MAX_CONCURRENCY = 50;

function builder<T>(argv: Argv<T>) {
    return argv
        .option('input', {
            alias: 'i',
            describe: 'input folder with xliff and skeleton files',
            type: 'string',
            default: process.cwd(),
        })
        .option('output', {
            alias: 'o',
            describe: 'output folder where translated markdown will be stored',
            type: 'string',
            default: process.cwd(),
        })
        .option('source', {
            alias: ['sll', 'source-language-locale'],
            describe: 'source language and locale',
            type: 'string',
        })
        .option('target', {
            alias: ['tll', 'target-language-locale'],
            describe: 'target language and locale',
            type: 'string',
        })
        .check(argvValidator);
}

type InputParams = {
    input: string;
    output: string;
};

type HandlerParams = {
    include?: string[];
    exclude?: string[];
    source?: string;
    sourceLanguage?: string;
    sourceLocale?: string;
    sourceLanguageLocale?: string;
    target?: string;
    targetLanguage?: string;
    targetLocale?: string;
    targetLanguageLocale?: string;
    translate?: HandlerParams & {
        extract?: HandlerParams;
    };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handler(args: Arguments<InputParams & HandlerParams>) {
    const params = normalizeParams({
        ...(args.translate || {}),
        ...(args.translate?.extract || {}),
        ...args,
    });

    ArgvService.init(params);

    const {input, output, source, targets, files} =
        ArgvService.getConfig() as unknown as TranslateParams;

    ok(source, `Required param source is not configured`);
    ok(targets.length, `Required param target is not configured`);

    for (const target of targets) {
        const [sourceLanguage, sourceLocale] = source;
        const [targetLanguage, targetLocale] = target;

        ok(sourceLanguage && sourceLocale, 'Invalid source language-locale config');
        ok(targetLanguage && targetLocale, 'Invalid target language-locale config');

        const configuredPipeline = pipeline({
            source: {language: sourceLanguage, locale: sourceLocale},
            target: {language: targetLanguage, locale: targetLocale},
            input,
            output,
        });

        await eachLimit(files, MAX_CONCURRENCY, asyncify(configuredPipeline));
    }
}

export type PipelineParameters = {
    input: string;
    output: string;
    source: ExtractOptions['source'];
    target: ExtractOptions['target'];
};

function pipeline(params: PipelineParameters) {
    const {input, output, source, target} = params;
    const inputRoot = resolve(input);
    const outputRoot = resolve(output);

    return async (path: string) => {
        const ext = extname(path);
        if (!['.yaml', '.json', '.md'].includes(ext)) {
            return;
        }

        const inputPath = join(inputRoot, path);
        const outputPath = path.replace(source.language, target.language);
        const xliffPath = join(outputRoot, outputPath + '.xliff');
        const skeletonPath = join(outputRoot, outputPath + '.skl');

        let schemas;
        if (['.yaml', '.json'].includes(ext)) {
            schemas = resolveSchemas(path);

            if (!schemas) {
                return;
            }
        }

        const content = await loadFile(inputPath);

        await mkdir(dirname(xliffPath), {recursive: true});

        const {xliff, skeleton} = _extract(content, {
            source,
            target,
        });

        await Promise.all([dumpFile(skeletonPath, skeleton), dumpFile(xliffPath, xliff)]);
    };
}

export {extract};

export default {extract};
