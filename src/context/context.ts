import {
    RevisionContext as RevisionContextTransfrom,
    RevisionMeta,
} from '@diplodoc/transform/lib/typings';
import glob from 'glob';
import {getMetaFile, makeMetaFile, updateChangedMetaFile, updateMetaFile} from '~/utils/meta';

export interface RevisionContext extends RevisionContextTransfrom {
    userInputFolder: string;
    userOutputFolder: string;
    tmpInputFolder: string;
    tmpOutputFolder: string;
    outputBundlePath: string;
}

export async function makeRevisionContext(
    cached: boolean,
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

    const meta = normalizeMeta(await getMetaFile(userOutputFolder));

    await updateMetaFile(cached, userInputFolder, meta.files, files);

    await updateChangedMetaFile(cached, userInputFolder, meta.files);

    return {
        userInputFolder,
        userOutputFolder,
        tmpInputFolder,
        tmpOutputFolder,
        outputBundlePath,
        files,
        meta,
    };
}

function normalizeMeta(meta?: RevisionMeta | undefined | null) {
    const metaSafe: RevisionMeta = meta ?? {
        files: {},
    };
    metaSafe.files = metaSafe.files ?? {};
    return metaSafe;
}

export async function setRevisionContext(context: RevisionContext): Promise<void> {
    await makeMetaFile(context.userOutputFolder, context.files, context.meta);
}
