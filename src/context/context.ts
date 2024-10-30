import {RevisionContext as RevisionContextTransfrom} from '@diplodoc/transform/lib/typings';
import glob from 'glob';

export interface RevisionContext extends RevisionContextTransfrom {
    userInputFolder: string;
    userOutputFolder: string;
    tmpInputFolder: string;
    tmpOutputFolder: string;
    outputBundlePath: string;
}

export async function makeRevisionContext(
    userInputFolder: string,
    userOutputFolder: string,
    tmpInputFolder: string,
    tmpOutputFolder: string,
    outputBundlePath: string,
): Promise<RevisionContext> {
    const files = glob.sync('**', {
        cwd: userInputFolder,
        nodir: true,
        follow: true,
        ignore: ['node_modules/**', '*/node_modules/**'],
    });

    return {
        userInputFolder,
        userOutputFolder,
        tmpInputFolder,
        tmpOutputFolder,
        outputBundlePath,
        files,
    };
}
