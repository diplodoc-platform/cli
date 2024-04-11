import type {IProgram, ProgramArgs, ProgramConfig} from '~/program';
import type {ExtractOptions} from '@diplodoc/translation';
import type {Locale} from '../utils';
import {ok} from 'node:assert';
import {dirname, extname, join, resolve} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {pick} from 'lodash';
import {gray} from 'chalk';
import {asyncify, eachLimit} from 'async';
import {BaseProgram} from '~/program/base';
import {Command, defined} from '~/config';
import {YFM_CONFIG_FILENAME} from '~/constants';
import {LogLevel, Logger} from '~/logger';
import {options} from '../config';
import {
    TranslateError,
    dumpFile,
    extract,
    loadFile,
    resolveFiles,
    resolveSchemas,
    resolveSource,
    resolveTargets,
} from '../utils';

const MAX_CONCURRENCY = 50;

export type ExtractArgs = ProgramArgs & {
    output: string;
    source?: string;
    target?: string | string[];
    include?: string[];
    exclude?: string[];
};

export type ExtractConfig = Pick<ProgramConfig, 'input' | 'strict' | 'quiet'> & {
    output: string;
    source: Locale;
    target: Locale[];
    include: string[];
    exclude: string[];
    files: string[];
};

class ExtractLogger extends Logger {
    readonly extract = this.topic(LogLevel.INFO, 'EXTRACT', gray);

    readonly extracted = this.topic(LogLevel.INFO, 'EXTRACTED');
}

export class Extract
    // eslint-disable-next-line new-cap
    extends BaseProgram<ExtractConfig, ExtractArgs>('Translate.Extract', {
        config: {
            defaults: () => ({}),
            strictScope: 'translate.extract',
        },
    })
    implements IProgram<ExtractArgs>
{
    readonly command = new Command('extract');

    readonly options = [
        options.input('./'),
        options.output(),
        options.source,
        options.target,
        options.files,
        options.include,
        options.exclude,
        options.config(YFM_CONFIG_FILENAME),
    ];

    readonly logger = new ExtractLogger();

    apply(program?: IProgram) {
        super.apply(program);

        this.hooks.Config.tap('Translate.Extract', (config, args) => {
            const {input, output, quiet, strict} = pick(args, [
                'input',
                'output',
                'quiet',
                'strict',
            ]) as ExtractArgs;

            const source = resolveSource(config, args);
            const target = resolveTargets(config, args);
            const include = defined('include', args, config) || [];
            const exclude = defined('exclude', args, config) || [];
            const files = resolveFiles(
                input,
                defined('files', args, config),
                include,
                exclude,
                source.language,
                ['.md', '.yaml'],
            );

            return Object.assign(config, {
                input,
                output: output || input,
                quiet,
                strict,
                source,
                target,
                files,
                include,
                exclude,
            });
        });
    }

    async action() {
        const {input, output, files, source, target: targets} = this.config;

        this.logger.setup(this.config);

        for (const target of targets) {
            ok(source.language && source.locale, 'Invalid source language-locale config');
            ok(target.language && target.locale, 'Invalid target language-locale config');

            const configuredPipeline = pipeline({
                source,
                target,
                input,
                output,
            });

            await eachLimit(
                files,
                MAX_CONCURRENCY,
                asyncify(async (file: string) => {
                    try {
                        this.logger.extract(file);
                        await configuredPipeline(file);
                        this.logger.extracted(file);
                    } catch (error: any) {
                        if (error instanceof TranslateError) {
                            this.logger.error(file, `${error.message}`, error.code);

                            if (error.fatal) {
                                process.exit(1);
                            }
                        } else {
                            this.logger.error(file, error.message);
                        }
                    }
                }),
            );
        }
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
        if (!['.yaml', '.md'].includes(ext)) {
            return;
        }

        const inputPath = join(inputRoot, path);
        const outputPath = path.replace(source.language, target.language);
        const xliffPath = join(outputRoot, outputPath + '.xliff');
        const skeletonPath = join(outputRoot, outputPath + '.skl');

        const schemas = await resolveSchemas(path);
        if (['.yaml'].includes(ext) && !schemas.length) {
            return;
        }

        const content = await loadFile(inputPath);

        await mkdir(dirname(xliffPath), {recursive: true});

        const {xliff, skeleton, units} = extract(content, {
            source,
            target,
            schemas,
        });

        if (!units.length) {
            return;
        }

        await Promise.all([dumpFile(skeletonPath, skeleton), dumpFile(xliffPath, xliff)]);
    };
}
