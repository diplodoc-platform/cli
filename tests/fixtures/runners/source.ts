import type {Report} from './types';

export class SourceRunner {
    readonly MODULE_PATH = require.resolve('../../../');

    async runYfmDocs(argv: string[]) {
        const {run} = await import(this.MODULE_PATH);

        const baseArgs = ['node', this.MODULE_PATH, ...argv];

        const report = await run(baseArgs) as Report;

        return report;
    }
}
