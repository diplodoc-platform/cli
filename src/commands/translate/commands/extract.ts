import type {BaseArgs} from '~/core/program';
import type {ExtractOptions} from '@diplodoc/translation';
import type {Locale} from '../utils';

import {ok} from 'node:assert';
import {join, resolve} from 'node:path';
import {pick} from 'lodash';
import {asyncify, eachLimit} from 'async';
import liquid from '@diplodoc/transform/lib/liquid';
// @ts-ignore
import {Xliff} from '@diplodoc/translation/lib/experiment/xliff/xliff';

import {
    BaseProgram,
    getHooks as getBaseHooks,
    withConfigDefaults,
    withConfigScope,
} from '~/core/program';
import {Command, defined} from '~/core/config';
import {YFM_CONFIG_FILENAME} from '~/constants';

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
    resolveVars,
} from '../utils';
import {Run} from '../run';
import {ConfigDefaults, configDefaults} from '../utils/config';
import {normalizePath} from '~/core/utils';

const MAX_CONCURRENCY = 50;

export type ExtractArgs = BaseArgs & {
    output: string;
    source?: string;
    target?: string | string[];
    include?: string[];
    exclude?: string[];
    vars?: Hash;
    useExperimentalParser?: boolean;
};

export type ExtractConfig = Pick<BaseArgs, 'input' | 'strict' | 'quiet'> & {
    output: AbsolutePath;
    source: Locale;
    target: Locale[];
    include: string[];
    exclude: string[];
    files: string[];
    skipped: [string, string][];
    vars: Hash;
    useExperimentalParser?: boolean;
    schema?: string;
} & ConfigDefaults;

@withConfigScope('translate.extract', {strict: true})
@withConfigDefaults(() => ({
    useExperimentalParser: false,
    ...configDefaults(),
}))
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
        options.vars,
        options.config(YFM_CONFIG_FILENAME),
        options.useExperimentalParser,
        options.schema,
    ];

    readonly logger = new TranslateLogger();

    private run!: Run;

    apply(program?: BaseProgram) {
        super.apply(program);

        getBaseHooks(this).Config.tap('Translate.Extract', (config, args) => {
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
            const files = defined('files', args, config) || [];

            const vars = resolveVars(config, args);

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
                vars,
                useExperimentalParser: defined('useExperimentalParser', args, config) || false,
            });
        });
    }

    async action() {
        const {
            input,
            output,
            source,
            target: targets,
            vars,
            useExperimentalParser,
            schema,
        } = this.config;

        this.logger.setup(this.config);

        this.run = new Run(this.config);

        await this.run.prepareRun();

        const [files, skipped] = await this.run.getFiles();

        for (const target of targets) {
            ok(source.language && source.locale, 'Invalid source language-locale config');
            ok(target.language && target.locale, 'Invalid target language-locale config');

            const configuredPipeline = pipeline({
                source,
                target,
                input,
                output,
                vars,
                useExperimentalParser,
                schema,
            });

            this.logger.skipped(skipped);

            await eachLimit(
                Array.from(files),
                MAX_CONCURRENCY,
                asyncify(async (file: string) => {
                    try {
                        this.logger.extract(file);
                        await configuredPipeline(file);
                        this.logger.extracted(file);
                    } catch (error: unknown) {
                        if (error instanceof TranslateError) {
                            if (error instanceof SkipTranslation) {
                                this.logger.skipped([[error.reason, file]]);
                                return;
                            }

                            this.logger.extractError(file, `${error.message}`);

                            if (error.fatal) {
                                process.exit(1);
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
    vars: Hash;
    useExperimentalParser?: boolean;
    schema?: ExtractOptions['schema'];
};

function pipeline(params: PipelineParameters) {
    const {input, output, source, target, vars, useExperimentalParser, schema} = params;
    const inputRoot = resolve(input);
    const outputRoot = resolve(output);

    return async (path: string) => {
        const inputPath = join(inputRoot, path);
        const content = new FileLoader(inputPath);
        const output = (path: string) => {
            const normalizedPath = normalizePath(path);
            const normalizedInputRoot = normalizePath(inputRoot);

            const relativePath = normalizedPath.replace(normalizedInputRoot, '');
            const targetPath = relativePath.replace(`/${source.language}/`, `/${target.language}/`);

            return join(outputRoot, targetPath);
        };

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

        const {schemas, ajvOptions} = await resolveSchemas({
            content: content.data,
            path,
            customSchemaPath: schema,
        });
        const {xliff, skeleton, units} = extract(content.data, {
            originalFile: path,
            source,
            target,
            schemas,
            useExperimentalParser,
            ajvOptions,
        });

        let xliffResult = xliff;
        if (useExperimentalParser && units === undefined) {
            const expXliff = xliff as unknown as Xliff;
            xliffResult = expXliff.toString();
            if (!expXliff.transUnits.length) {
                throw new EmptyTokensError();
            }
        } else if (!units.length) {
            throw new EmptyTokensError();
        }

        const xlf = new FileLoader(inputPath).set(xliffResult);
        const skl = new FileLoader(inputPath).set(skeleton);

        await Promise.all([
            xlf.dump((path) => output(path) + '.xliff'),
            skl.dump((path) => output(path) + '.skl'),
        ]);
    };
}
