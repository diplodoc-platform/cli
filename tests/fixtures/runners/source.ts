export class SourceRunner {
    readonly MODULE_PATH = require.resolve('../../../');

    async runYfmDocs(argv: string[]): Promise<void> {
        const {run} = await import(this.MODULE_PATH);

        const baseArgs = ['node', this.MODULE_PATH, ...argv];

        const exitCode = await run(baseArgs);

        if (exitCode !== 0) {
            throw new Error(`CLI exited with code ${exitCode}`);
        }
    }
}
