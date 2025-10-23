import type {BaseArgs} from '~/core/program';
import type {ExtractOptions, JSONObject} from '@diplodoc/translation';
import type {Locale} from '../utils';
import type {ConfigDefaults} from '../utils/config';

import {ok} from 'node:assert';
import {join, resolve} from 'node:path';
import {pick} from 'lodash';
import {asyncify, eachLimit} from 'async';

import {normalizePath} from '~/core/utils';
import {YFM_CONFIG_FILENAME} from '~/constants';
import {Command, defined} from '~/core/config';
import {
    BaseProgram,
    getHooks as getBaseHooks,
    withConfigDefaults,
    withConfigScope,
} from '~/core/program';

import {Extension as ExtractOpenapiIncluderFakeExtension} from '../extract-openapi';
import {FilterExtract} from '../features/filter-extract';
import {options} from '../config';
import {TranslateLogger} from '../logger';
import {
    EmptyTokensError,
    FileLoader,
    SkipTranslation,
    TranslateError,
    extract,
    resolveSchemas,
    resolveSource,
    resolveTargets,
} from '../utils';
import {Run} from '../run';
import {configDefaults} from '../utils/config';

import {getHooks, withHooks} from './hooks';

const MAX_CONCURRENCY = 50;

export type ExtractArgs = BaseArgs & {
    output: string;
    source?: string;
    target?: string | string[];
    include?: string[];
    exclude?: string[];
    filter?: boolean;
};

export type ExtractConfig = Pick<BaseArgs, 'input' | 'strict' | 'quiet'> & {
    output: AbsolutePath;
    source: Locale;
    target: Locale[];
    include: string[];
    exclude: string[];
    files: string[];
    skipped: [string, string][];
    schema?: string;
    filter?: boolean;
} & ConfigDefaults;

@withHooks
@withConfigScope('translate.extract', {strict: true})
@withConfigDefaults(() => configDefaults())
export class Extract extends BaseProgram<ExtractConfig, ExtractArgs> {
    readonly name = 'Translate.Extract';

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
        options.schema,
        options.filter,
    ];

    readonly modules = [new ExtractOpenapiIncluderFakeExtension(), new FilterExtract()];

    readonly logger = new TranslateLogger();

    private run!: Run;

    apply(program?: BaseProgram) {
        super.apply(program);

        getBaseHooks(this).Config.tap('Translate.Extract', (config, args) => {
            const {input, output, quiet, strict, filter} = pick(args, [
                'input',
                'output',
                'quiet',
                'strict',
                'filter',
            ]) as ExtractArgs;
            const source = resolveSource(config, args);
            const target = resolveTargets(config, args);
            const include = defined('include', args, config) || [];
            const exclude = defined('exclude', args, config) || [];
            const files = defined('files', args, config) || [];

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
                filter,
            });
        });
    }

    async action() {
        const {input, output, source, target: targets, schema} = this.config;

        this.logger.setup(this.config);

        this.run = new Run(this.config);

        await getBaseHooks(this).BeforeAnyRun.promise(this.run);
        await getHooks(this).BeforeRun.promise(this.run);

        await this.run.prepareRun();

        const [files, skipped] = await this.run.getFiles();
        const exit = process.exit;

        for (const target of targets) {
            ok(source.language && source.locale, 'Invalid source language-locale config');
            ok(target.language && target.locale, 'Invalid target language-locale config');

            const configuredPipeline = pipeline({
                source,
                target,
                input,
                output,
                schema,
            });

            this.logger.skipped(skipped);

            await eachLimit(
                Array.from(files),
                MAX_CONCURRENCY,
                asyncify(async (file: NormalizedPath) => {
                    try {
                        this.logger.extract(file);
                        const content = await this.run.getFileContent(file);

                        await configuredPipeline(file, content);
                        this.logger.extracted(file);
                    } catch (error: unknown) {
                        if (error instanceof TranslateError) {
                            if (error instanceof SkipTranslation) {
                                this.logger.skipped([[error.reason, file]]);
                                return;
                            }

                            this.logger.extractError(file, `${error.message}`);

                            if (error.fatal) {
                                exit(1);
                            }
                        } else {
                            this.logger.error(file, error);
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
    schema?: ExtractOptions['schema'];
};

function pipeline(params: PipelineParameters) {
    const {input, output, source, target, schema} = params;
    const inputRoot = resolve(input);
    const outputRoot = resolve(output);

    return async (path: string, content: string | JSONObject) => {
        const inputPath = join(inputRoot, path);
        const output = (path: string) => {
            const normalizedPath = normalizePath(path);
            const normalizedInputRoot = normalizePath(inputRoot);

            const relativePath = normalizedPath.replace(normalizedInputRoot, '');
            const targetPath = relativePath.replace(`/${source.language}/`, `/${target.language}/`);

            return join(outputRoot, targetPath);
        };

        const {schemas, ajvOptions} = await resolveSchemas({
            content,
            path,
            customSchemaPath: schema,
        });
        const {xliff, skeleton, units} = extract(content, {
            originalFile: path,
            source,
            target,
            schemas,
            ajvOptions,
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
