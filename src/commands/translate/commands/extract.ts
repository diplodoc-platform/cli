import type {IProgram, ProgramArgs, ProgramConfig} from '~/program';
import type {ExtractOptions} from '@diplodoc/translation';
import type {Locale} from '../utils';
import {ok} from 'node:assert';
import {join, resolve} from 'node:path';
import {pick} from 'lodash';
import {asyncify, eachLimit} from 'async';
import liquid from '@diplodoc/transform/lib/liquid';
import {BaseProgram} from '~/program/base';
import {Command, defined} from '~/config';
import {YFM_CONFIG_FILENAME} from '~/constants';
import {options} from '../config';
import {TranslateLogger} from '../logger';
import {
    EmptyTokensError,
    FileLoader,
    SkipTranslation,
    TranslateError,
    extract,
    resolveFiles,
    resolveSchemas,
    resolveSource,
    resolveTargets,
    resolveVars,
} from '../utils';

const MAX_CONCURRENCY = 50;

export type ExtractArgs = ProgramArgs & {
    output: string;
    source?: string;
    target?: string | string[];
    include?: string[];
    exclude?: string[];
    vars?: Record<string, any>;
};

export type ExtractConfig = Pick<ProgramConfig, 'input' | 'strict' | 'quiet'> & {
    output: string;
    source: Locale;
    target: Locale[];
    include: string[];
    exclude: string[];
    files: string[];
    skipped: [string, string][];
    vars: Record<string, any>;
};

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
        options.vars,
        options.config(YFM_CONFIG_FILENAME),
    ];

    readonly logger = new TranslateLogger();

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
            const [files, skipped] = resolveFiles(
                input,
                defined('files', args, config),
                include,
                exclude,
                source.language,
                ['.md', '.yaml'],
            );
            const vars = resolveVars(config, args);

            return Object.assign(config, {
                input,
                output: output || input,
                quiet,
                strict,
                source,
                target,
                files,
                skipped,
                include,
                exclude,
                vars,
            });
        });
    }

    async action() {
        const {input, output, files, skipped, source, target: targets, vars} = this.config;

        this.logger.setup(this.config);

        for (const target of targets) {
            ok(source.language && source.locale, 'Invalid source language-locale config');
            ok(target.language && target.locale, 'Invalid target language-locale config');

            const configuredPipeline = pipeline({
                source,
                target,
                input,
                output,
                vars,
            });

            this.logger.skipped(skipped);

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
                            if (error instanceof SkipTranslation) {
                                this.logger.skipped([[error.reason, file]]);
                                return;
                            }

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
    vars: Record<string, any>;
};

function pipeline(params: PipelineParameters) {
    const {input, output, source, target, vars} = params;
    const inputRoot = resolve(input);
    const outputRoot = resolve(output);

    return async (path: string) => {
        const inputPath = join(inputRoot, path);
        const content = new FileLoader(inputPath);
        const output = (path: string) =>
            join(
                outputRoot,
                path
                    .replace(inputRoot, '')
                    .replace('/' + source.language + '/', '/' + target.language + '/'),
            );

        await content.load();

        if (Object.keys(vars).length && content.isString) {
            content.set(
                liquid(content.data as string, vars, inputPath, {
                    conditions: 'strict',
                    substitutions: false,
                    cycles: false,
                }),
            );
        }

        const schemas = await resolveSchemas(path);
        const {xliff, skeleton, units} = extract(content.data, {
            source,
            target,
            schemas,
        });

        if (!units.length) {
            throw new EmptyTokensError();
        }

        const xlf = new FileLoader(inputPath).set(xliff);
        const skl = new FileLoader(inputPath).set(skeleton);

        await Promise.all([
            xlf.dump((path) => output(path) + '.xliff'),
            skl.dump((path) => output(path) + '.skl'),
        ]);
    };
}
