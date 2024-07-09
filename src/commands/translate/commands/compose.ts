import type {IProgram, ProgramArgs, ProgramConfig} from '~/program';
import type {ComposeOptions} from '@diplodoc/translation';
import {extname, join} from 'node:path';
import {pick} from 'lodash';
import {asyncify, eachLimit} from 'async';
import {BaseProgram} from '~/program/base';
import {Command, defined} from '~/config';
import {YFM_CONFIG_FILENAME} from '~/constants';
import {options} from '../config';
import {TranslateLogger} from '../logger';
import {FileLoader, TranslateError, compose, resolveFiles, resolveSchemas} from '../utils';

const MAX_CONCURRENCY = 50;

export type ComposeArgs = ProgramArgs & {
    output: string;
    include?: string[];
    exclude?: string[];
    useSource?: boolean;
};

export type ComposeConfig = Pick<ProgramConfig, 'input' | 'strict' | 'quiet'> & {
    output: string;
    include: string[];
    exclude: string[];
    files: string[];
    skipped: [string, string][];
    useSource: boolean;
};

export class Compose
    // eslint-disable-next-line new-cap
    extends BaseProgram<ComposeConfig, ComposeArgs>('Translate.Compose', {
        config: {
            defaults: () => ({}),
            strictScope: 'translate.compose',
        },
    })
    implements IProgram<ComposeArgs>
{
    readonly command = new Command('compose');

    readonly options = [
        options.input('./'),
        options.output(),
        options.include,
        options.exclude,
        options.config(YFM_CONFIG_FILENAME),
        options.useSource,
    ];

    readonly logger = new TranslateLogger();

    apply(program?: IProgram) {
        super.apply(program);

        this.hooks.Config.tap('Translate.Compose', (config, args) => {
            const {input, output, quiet, strict} = pick(args, [
                'input',
                'output',
                'quiet',
                'strict',
            ]) as ComposeArgs;
            const include = defined('include', args, config) || [];
            const exclude = defined('exclude', args, config) || [];
            const [files, skipped] = resolveFiles(
                input,
                defined('files', args, config),
                include,
                exclude,
                null,
                ['.skl', '.xliff'],
            );

            return Object.assign(config, {
                input,
                output: output || input,
                quiet,
                strict,
                files,
                skipped,
                include,
                exclude,
                useSource: defined('useSource', args, config) || false,
            });
        });
    }

    async action() {
        const {input, output, files, skipped, useSource} = this.config;

        this.logger.setup(this.config);

        const configuredPipeline = pipeline(input, output, {useSource});
        const pairs = files.reduce(
            (acc, file) => {
                const ext = extname(file);
                const path = file.slice(0, -ext.length);

                acc[path] = acc[path] || {path, ext};
                acc[path][ext.slice(1) as 'xliff' | 'skl'] = file;

                return acc;
            },
            {} as Record<string, FileInfo>,
        );

        this.logger.skipped(skipped);

        await eachLimit(
            pairs,
            MAX_CONCURRENCY,
            asyncify(async (file: FileInfo) => {
                try {
                    this.logger.compose(file.path);
                    await configuredPipeline(file);
                    this.logger.composed(file.path);
                } catch (error: any) {
                    if (error instanceof TranslateError) {
                        this.logger.composeError(file.path, `${error.message}`);

                        if (error.fatal) {
                            process.exit(1);
                        }
                    } else {
                        this.logger.error(file.path, error.message);
                    }
                }
            }),
        );
    }
}

type FileInfo = {
    path: string;
    xliff: string;
    skl: string;
    ext: string;
};

function pipeline(input: string, output: string, {useSource}: ComposeOptions) {
    return async (file: FileInfo) => {
        const skeleton = new FileLoader(join(input, file.skl));
        const xliff = new FileLoader<string>(join(input, file.xliff));

        await Promise.all([skeleton.load(), xliff.load()]);

        const schemas = await resolveSchemas(file.path);
        const content = new FileLoader(join(output, file.path));

        content.set(compose(skeleton.data, xliff.data, {useSource, schemas}));

        await content.dump();
    };
}
