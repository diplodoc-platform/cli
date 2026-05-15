import {resolve} from 'node:path';

import {SourceRunner} from './source';
import {BinaryRunner} from './binary';
import {Runner} from './types';

export {Runner};

export function createRunner(): Runner {
    const binaryPath =
        process.env.DIPLODOC_BINARY_PATH || resolve(__dirname, '../../../build/index.js');

    if (binaryPath) {
        return new BinaryRunner(binaryPath);
    }

    return new SourceRunner();
}
