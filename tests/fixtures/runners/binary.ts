import {Runner} from './types';
import {execa} from 'execa';

export class BinaryRunner implements Runner {
    private readonly binaryPath: string;

    constructor(binaryPath: string) {
        this.binaryPath = binaryPath;
    }

    async runYfmDocs(argv: string[]) {
        const {all} = await execa(this.binaryPath, argv, {all: true});

        // eslint-disable-next-line no-console
        console.log(all);
    }
}
