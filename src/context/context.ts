import {
    RevisionContext as RevisionContextTransfrom,
    RevisionMeta,
} from '@diplodoc/transform/lib/typings';
import glob from 'glob';
import {ArgvService} from '~/services';
import {getMetaFile, makeMetaFile, updateChangedMetaFile, updateMetaFile} from '~/utils/meta';

export interface RevisionContext extends RevisionContextTransfrom {
    userInputFolder: string;
    userOutputFolder: string;
    tmpInputFolder: string;
    tmpOutputFolder: string;
    outputBundlePath: string;
}

export async function makeRevisionContext(
    userOutputFolder: string,
    tmpInputFolder: string,
    tmpOutputFolder: string,
    outputBundlePath: string,
): Promise<RevisionContext> {
    const args = ArgvService.getConfig();

    const files = glob.sync('**', {
        cwd: args.rootInput,
        nodir: true,
        follow: true,
        ignore: ['node_modules/**', '*/node_modules/**'],
    });

    const meta = normalizeMeta(await getMetaFile(userOutputFolder));

    await updateMetaFile(args.cached, args.rootInput, meta.files, files);

    await updateChangedMetaFile(args.cached, args.rootInput, meta.files);

    return {
        userInputFolder: args.rootInput,
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
