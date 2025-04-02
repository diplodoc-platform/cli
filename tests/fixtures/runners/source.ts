export interface BuildResult {
    stdout: string;
    stderr: string;
    code: number;
}

export interface RunYfmDocsArgs {
    md2md?: boolean;
    md2html?: boolean;
    args?: string;
}

export class SourceRunner {
    private readonly cliPath: string;

    constructor() {
        // Allow overriding the CLI path via environment variable, otherwise use local build
        this.cliPath = process.env.DIPLODOC_CLI_BUILD_PATH || require.resolve('../../../build');
    }

    async runYfmDocs(
        inputPath: string,
        outputPath: string,
        {md2md = true, md2html = true, args = ''}: RunYfmDocsArgs = {},
    ): Promise<void> {
        const {run} = await import(this.cliPath);
        
        const defaultArgs = ['--quiet', '--allowHTML'];
        const baseArgs = ['node', this.cliPath, '--input', inputPath, '--output', outputPath, ...defaultArgs];
        const extraArgs = args.split(' ').filter(Boolean);

        if (md2md && md2html) {
            await run([...baseArgs, '--output', outputPath, '-f', 'md', ...extraArgs]);
            await run([...baseArgs, '--output', `${outputPath}-html`, ...extraArgs]);
        } else if (md2md) {
            await run([...baseArgs, '--output', outputPath, '-f', 'md', ...extraArgs]);
        } else {
            await run([...baseArgs, '--output', outputPath, ...extraArgs]);
        }
    }
}
