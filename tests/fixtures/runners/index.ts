import {SourceRunner, RunYfmDocsArgs} from './source';
import {BinaryRunner} from './binary';

export type {BuildResult, RunYfmDocsArgs} from './source';

export interface Runner {
    runYfmDocs(inputPath: string, outputPath: string, args?: RunYfmDocsArgs): Promise<void>;
}

export function createRunner(): Runner {
    const binaryPath = process.env.DIPLODOC_BINARY_PATH;
    
    if (binaryPath) {
        return new BinaryRunner(binaryPath);
    }
    
    return new SourceRunner();
} 
