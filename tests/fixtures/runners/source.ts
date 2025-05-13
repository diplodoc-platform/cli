const MODULE_PATH = require.resolve('../../../');

export class SourceRunner {
    async runYfmDocs(argv: string[]): Promise<void> {
        const {run} = await import(MODULE_PATH);

        const baseArgs = ['node', MODULE_PATH, ...argv];

        const exitCode = await run(baseArgs);

        if (exitCode !== 0) {
            throw new Error(`CLI exited with code ${exitCode}`);
        }
    }
}
