import {Runner, createRunner} from './runners';
import {cleanupDirectory} from './utils/file';

export interface TestRunArgs {
    md2md?: boolean;
    md2html?: boolean;
    args?: string;
}

export class CliTestAdapter {
    private readonly runner: Runner = createRunner();

    async testPass(
        inputPath: string,
        outputPath: string,
        {md2md = true, md2html = true, args = ''}: TestRunArgs = {},
    ): Promise<void> {
        cleanupDirectory(outputPath);

        const baseArgs = [
            '--input',
            inputPath,
            '--quiet',
            '--allowHTML',
            ...args.split(' ').filter(Boolean),
        ];

        if (md2md && md2html) {
            cleanupDirectory(`${outputPath}-html`);

            await this.runner.runYfmDocs([...baseArgs, '--output', outputPath, '-f', 'md']);
            await this.runner.runYfmDocs([...baseArgs, '--output', `${outputPath}-html`, '-f', 'html']);
        } else if (md2md) {
            await this.runner.runYfmDocs([...baseArgs, '--output', outputPath, '-f', 'md']);
        } else {
            await this.runner.runYfmDocs([...baseArgs, '--output', outputPath]);
        }
    }
}
