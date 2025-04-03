export class SourceRunner {
    private readonly cliPath: string;

    constructor() {
        // Allow overriding the CLI path via environment variable, otherwise use local build
        this.cliPath = process.env.DIPLODOC_CLI_BUILD_PATH || require.resolve('../../../build');
    }

    async runYfmDocs(argv: string[]): Promise<void> {
        const {run} = await import(this.cliPath);

        const baseArgs = ['node', this.cliPath, ...argv];

        const exitCode = await run(baseArgs);

        if (exitCode !== 0) {
            throw new Error(`CLI exited with code ${exitCode}`);
        }
    }
}
