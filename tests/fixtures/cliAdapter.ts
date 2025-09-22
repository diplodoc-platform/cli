import type {Runner} from './runners';

import {createRunner} from './runners';
import {cleanupDirectory} from './utils/file';

export interface BuildRunArgs {
    md2md?: boolean;
    md2html?: boolean;
    args?: string;
}

export interface TranslateRunArgs {
    subcommand: 'extract';
    source: string;
    target: string;
    additionalArgs?: string;
}

class Build {
    private readonly runner: Runner;

    constructor(runner: Runner) {
        this.runner = runner;
    }

    run(input: string, output: string, args: string[]) {
        return this.runner.runYfmDocs([
            '--input',
            input,
            '--output',
            output,
            '--quiet',
            '--allowHTML',
            ...args,
        ]);
    }
}

class Extract {
    private readonly runner: Runner;

    constructor(runner: Runner) {
        this.runner = runner;
    }

    run(input: string, output: string, args: string[]) {
        return this.runner.runYfmDocs([
            'translate',
            'extract',
            '--input',
            input,
            '--output',
            output,
            '--quiet',
            ...args,
        ]);
    }
}

export class CliTestAdapter {
    readonly runner: Runner = createRunner();

    readonly build = new Build(this.runner);

    readonly extract = new Extract(this.runner);

    async testBuildPass(
        inputPath: string,
        outputPath: string,
        {md2md = true, md2html = true, args = ''}: BuildRunArgs = {},
    ): Promise<void> {
        await cleanupDirectory(outputPath);
        await cleanupDirectory(`${outputPath}-md`);
        await cleanupDirectory(`${outputPath}-html`);

        const baseArgs = args.split(' ').filter(Boolean);

        const tasks = [];

        if (md2md && md2html) {
            tasks.push(() => this.build.run(inputPath, outputPath, [...baseArgs, '-f', 'md']));
            tasks.push(() =>
                this.build.run(inputPath, `${outputPath}-html`, [...baseArgs, '-f', 'html']),
            );
        } else if (md2md) {
            tasks.push(() => this.build.run(inputPath, outputPath, [...baseArgs, '-f', 'md']));
        } else {
            tasks.push(() => this.build.run(inputPath, outputPath, [...baseArgs, '-f', 'html']));
        }

        for (const task of tasks) {
            const report = await task();
            if (report.code > 0) {
                throw report;
            }
        }
    }

    async testTranslatePass(
        inputPath: string,
        outputPath: string,
        {subcommand, source, target, additionalArgs = ''}: TranslateRunArgs,
    ): Promise<void> {
        await cleanupDirectory(outputPath);

        const baseArgs = [
            'translate',
            subcommand,
            '--quiet',
            '--input',
            inputPath,
            '--output',
            outputPath,
            '--source',
            source,
            '--target',
            target,
            ...additionalArgs.split(' ').filter(Boolean),
        ];

        await this.runner.runYfmDocs(baseArgs);
    }
}

export const TestAdapter = new CliTestAdapter();
