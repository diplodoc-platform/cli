import {spawn} from 'child_process';
import {Runner} from './types';

export class BinaryRunner implements Runner {
    private readonly binaryPath: string;

    constructor(binaryPath: string) {
        this.binaryPath = binaryPath;
    }

    runYfmDocs(argv: string[]): Promise<void> {
        return this.spawnAsync(argv);
    }

    private spawnAsync(argv: string[]): Promise<void> {
        return new Promise((resolve, reject) => {
            const child = spawn(this.binaryPath, argv, {
                stdio: 'inherit',
            });

            child.on('error', reject);
            child.on('exit', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Process exited with code ${code}`));
                }
            });
        });
    }
}
