import {Runner, createRunner} from './runners';
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

export class CliTestAdapter {
    private readonly runner: Runner = createRunner();

    async testBuildPass(
        inputPath: string,
        outputPath: string,
        {md2md = true, md2html = true, args = ''}: BuildRunArgs = {},
    ): Promise<void> {
        await cleanupDirectory(outputPath);

        const baseArgs = [
            '--input',
            inputPath,
            '--quiet',
            '--allowHTML',
            ...args.split(' ').filter(Boolean),
        ];

        if (md2md && md2html) {
            await cleanupDirectory(`${outputPath}-html`);

            await this.runner.runYfmDocs([...baseArgs, '--output', outputPath, '-f', 'md']);
            await this.runner.runYfmDocs([
                ...baseArgs,
                '--output',
                `${outputPath}-html`,
                '-f',
                'html',
            ]);
        } else if (md2md) {
            await this.runner.runYfmDocs([...baseArgs, '--output', outputPath, '-f', 'md']);
        } else {
            await this.runner.runYfmDocs([...baseArgs, '--output', outputPath]);
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
