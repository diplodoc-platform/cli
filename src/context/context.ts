import { RevisionContext as RevisionContextTransfrom } from '@diplodoc/transform/lib/typings';
import glob from 'glob';
import { ArgvService } from '~/services';
import { getFileChangedMeta, getMetaFile, makeMetaFile } from '~/utils/meta';

export interface RevisionContext extends RevisionContextTransfrom {
    userInputFolder: string;
    userOutputFolder: string;
    tmpInputFolder: string;
    tmpOutputFolder: string;
}

export async function getRevisionContext(userOutputFolder: string, tmpInputFolder: string, tmpOutputFolder: string): Promise<RevisionContext> {
    const args = ArgvService.getConfig();

    const files = glob.sync('**', {
        cwd: args.rootInput,
        nodir: true,
        follow: true,
        ignore: ['node_modules/**', '*/node_modules/**'],
    });

    const meta = await getMetaFile(
        userOutputFolder,
    );

    await getFileChangedMeta(
        args.cached,
        args.rootInput,
        meta?.files,
    );

    return {
        userInputFolder: args.rootInput,
        userOutputFolder,
        tmpInputFolder,
        tmpOutputFolder,
        files,
        meta: args.cached ? meta : null,
    }
}

export async function setRevisionContext(context: RevisionContext): Promise<void> {
    const args = ArgvService.getConfig();

    await makeMetaFile(
        context.userOutputFolder,
        args.rootInput,
        context.files,
        context.meta,
    );
}
