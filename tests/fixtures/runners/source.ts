import {exec} from 'child_process';
import {promisify} from 'util';
import {resolve} from 'path';

const execAsync = promisify(exec);

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
        this.cliPath = process.env.DIPLODOC_CLI_PATH || require.resolve('../../../build');
    }

    async runYfmDocs(inputPath: string, outputPath: string, {md2md = true, md2html = true, args = ''}: RunYfmDocsArgs = {}): Promise<void> {
        const defaults = ' --quiet --allowHTML';
        const baseCommand = `node ${this.cliPath} --input ${inputPath} --output ${outputPath} ${defaults}`;

        if (md2md && md2html) {
            await execAsync(`${baseCommand} --output ${outputPath} -f md ${args}`);
            await execAsync(`${baseCommand} --output ${outputPath}-html ${args}`);
        } else if (md2md) {
            await execAsync(`${baseCommand} --output ${outputPath} -f md ${args}`);
        } else {
            await execAsync(`${baseCommand} --output ${outputPath} ${args}`);
        }
    }
} 
