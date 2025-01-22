import type {IProgram, BaseArgs as ProgramArgs, BaseConfig as ProgramConfig} from '~/core/program';

import {pick} from 'lodash';

import {BaseProgram} from '~/core/program';
import {GenericIncluderExtension, OpenapiIncluderExtension} from '~/core/toc';
import {Stage, YFM_CONFIG_FILENAME} from '~/constants';
import {Command, Config} from '../../core/config';

import {options} from '../build/config';
import {Run} from '../build/run';
import {Templating, TemplatingArgs, TemplatingConfig} from '../build/features/templating';
import {LintArgs, LintConfig} from '../build/features/linter';

import {handler} from './handler';
import {Hooks, hooks} from './hooks';

type BaseArgs = {output: AbsolutePath};

type BaseConfig = {
    varsPreset: string;
    vars: Hash;
    allowHtml: boolean;
    sanitizeHtml: boolean;
    ignoreStage: string[];
    ignore: string[];
};

export type {Run};

const command = 'Build';

export type CommandArgs = ProgramArgs & BaseArgs & Partial<TemplatingArgs & LintArgs>;

export type CommandConfig = Config<
    BaseArgs & ProgramConfig & BaseConfig & TemplatingConfig & LintConfig
>;

export class Lint
    // eslint-disable-next-line new-cap
    extends BaseProgram<CommandConfig, CommandArgs>(command, {
        config: {
            scope: 'link',
            defaults: () =>
                ({
                    varsPreset: 'default',
                    vars: {},
                    ignore: [],
                    allowHtml: true,
                    sanitizeHtml: true,
                    ignoreStage: [Stage.SKIP],
                    lint: {enabled: true, config: {'log-levels': {}}},
                }) as Partial<CommandConfig>,
        },
    })
    implements IProgram<CommandArgs>
{
    readonly [Hooks] = hooks();

    readonly templating = new Templating();

    // readonly linter = new Lint();

    readonly command = new Command('build').description('Build documentation in target directory');

    readonly options = [
        options.input('./'),
        options.output({required: true}),
        options.varsPreset,
        options.vars,
        options.allowHtml,
        options.sanitizeHtml,
        options.ignore,
        options.ignoreStage,
        options.config(YFM_CONFIG_FILENAME),
    ];

    apply(program?: IProgram) {
        this[Hooks].Config.tap('Lint', (config, args) => {
            config.ignoreStage = ([] as string[]).concat(config.ignoreStage);

            return config;
        });

        this.templating.apply(this);
        this.linter.apply(this);

        new GenericIncluderExtension().apply(this);
        new OpenapiIncluderExtension().apply(this);

        super.apply(program);
    }

    async action(config?: CommandConfig, chunk?: NormalizedPath[]) {
        const run = new Run(config || this.config);

        run.logger.pipe(this.logger);

        await this[Hooks].BeforeAnyRun.promise(run);

        await run.toc.init(chunk);

        await Promise.all([handler(run), this[Hooks].Run.promise(run)]);

        await this[Hooks].AfterAnyRun.promise(run);
    }
}
