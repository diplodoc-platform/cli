import glob from 'glob';
import { ArgvService } from '~/services';
import { RevisionMeta, getMetaFile, makeMetaFile } from '~/utils/meta';

export interface RevisionContext {
    userOutputFolder: string;
    files: string[];
    meta: RevisionMeta | null;
    deps: {
        [key: string]: {
            files: string[];
            vars: string[];
        };
    };
}

export async function getRevisionContext(userOutputFolder: string): Promise<RevisionContext> {
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

    return {
        userOutputFolder,
        files,
        meta: args.cache ? meta : null,
        deps: {},
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
