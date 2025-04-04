import {SourceRunner} from './source';
import {BinaryRunner} from './binary';
import {Runner} from './types';

export {Runner};

export function createRunner(): Runner {
    const binaryPath = process.env.DIPLODOC_BINARY_PATH;

    if (binaryPath) {
        return new BinaryRunner(binaryPath);
    }

    return new SourceRunner();
}
