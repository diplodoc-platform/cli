export class SourceRunner {
    async runYfmDocs(argv: string[]): Promise<void> {
        const modulePath = require.resolve('@diplodoc/cli');

        const {run} = await import(modulePath);

        const baseArgs = ['node', modulePath, ...argv];

        const exitCode = await run(baseArgs);

        if (exitCode !== 0) {
            throw new Error(`CLI exited with code ${exitCode}`);
        }
    }
}
