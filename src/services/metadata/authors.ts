import type {Run} from '~/commands/build';
import type {Contributor} from '~/models';

export async function getAuthorDetails(
    run: Run,
    path: RelativePath,
    author: string | object | null | undefined,
): Promise<Contributor | null> {
    if (!author) {
        const user = await run.vcs.getUserByPath(path);

        return user || null;
    }

    if (typeof author === 'object') {
        return author as Contributor;
    }

    try {
        return JSON.parse(author);
    } catch {
        const user = await run.vcs.getUserByLogin(author);

        return user || null;
    }
}
