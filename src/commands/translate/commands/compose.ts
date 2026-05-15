import type {BaseArgs} from '~/core/program';
import type {ComposeOptions} from '@diplodoc/translation';

import {extname, join} from 'node:path';
import {pick} from 'lodash';
import {asyncify, eachLimit} from 'async';

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
import {FileLoader, TranslateError, compose, resolveFiles, resolveSchemas} from '../utils';

const MAX_CONCURRENCY = 50;

export type ComposeArgs = BaseArgs & {
    output: AbsolutePath;
    include?: string[];
    exclude?: string[];
    useSource?: boolean;
};

export type ComposeConfig = Pick<BaseArgs, 'input' | 'strict' | 'quiet'> & {
    output: AbsolutePath;
    include: string[];
    exclude: string[];
    files: string[];
    skipped: [string, string][];
    useSource: boolean;
};

@withConfigScope('translate.compose', {strict: true})
@withConfigDefaults(() => ({
    useSource: false,
}))
export class Compose extends BaseProgram<ComposeConfig, ComposeArgs> {
    readonly name = 'Translate.Compose';

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

    apply(program?: BaseProgram) {
        super.apply(program);

        getBaseHooks(this).Config.tap('Translate.Compose', (config, args) => {
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
                } catch (error: unknown) {
                    if (error instanceof TranslateError) {
                        this.logger.composeError(file.path, `${error.message}`);

                        if (error.fatal) {
                            process.exit(1);
                        }
                    } else {
                        this.logger.error(file.path, error);
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

function pipeline(input: AbsolutePath, output: AbsolutePath, {useSource}: ComposeOptions) {
    return async function pipeline(file: FileInfo) {
        const skeleton = new FileLoader(join(input, file.skl));
        const xliff = new FileLoader<string>(join(input, file.xliff));

        await Promise.all([skeleton.load(), xliff.load()]);

        const content = new FileLoader(join(output, file.path));
        const {schemas, ajvOptions} = await resolveSchemas({
            content: skeleton.data,
            path: file.path,
        });

        const result = compose(skeleton.data, xliff.data, {
            useSource,
            schemas,
            ajvOptions,
        });

        content.set(result);

        await content.dump();
    };
}
