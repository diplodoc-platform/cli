import type {LoaderContext} from '~/core/markdown/loader';

import {CodeRegions} from './regions';

class CodeSource {
    readonly content: string;
    private index?: {regions: CodeRegions} | {error: Error};

    constructor(content: string) {
        this.content = content;
    }

    selectRegion(name: string) {
        if (!this.index) {
            try {
                this.index = {regions: new CodeRegions(this.content)};
            } catch (error) {
                this.index = {error: error instanceof Error ? error : new Error(String(error))};
            }
        }
        if ('error' in this.index) {
            throw this.index.error;
        }
        return this.index.regions.select(name);
    }
}

/** Shares file reads and lazy region indexes within one Markdown revision. */
export class CodeSources {
    private readonly files = new Map<NormalizedPath, Promise<CodeSource>>();
    private revision?: number;
    private readonly getRevision: () => number;

    constructor(getRevision: () => number) {
        this.getRevision = getRevision;
    }

    read(context: LoaderContext, target: NormalizedPath): Promise<CodeSource> {
        const revision = this.getRevision();
        if (revision !== this.revision) {
            this.files.clear();
            this.revision = revision;
        }

        let pending = this.files.get(target);
        if (!pending) {
            // Cache the in-flight read as well, since pages are loaded concurrently.
            pending = context.readFile(target).then((content) => new CodeSource(content));
            this.files.set(target, pending);
            pending.catch((error) => {
                // Missing literal paths are probed for region selectors as well.
                // Keep those results until watch invalidates the Markdown revision.
                if (!isLiteralProbeMiss(error) && this.files.get(target) === pending) {
                    this.files.delete(target);
                }
            });
        }
        return pending;
    }
}

/** An optional selector probe can exceed a filesystem limit even for a valid source file. */
export function isLiteralProbeMiss(error: unknown): boolean {
    return (
        isMissingCodeSource(error) ||
        Boolean(
            error && typeof error === 'object' && 'code' in error && error.code === 'ENAMETOOLONG',
        )
    );
}

/** Filesystem failures that allow an optional literal-file lookup to fall back. */
export function isMissingCodeSource(error: unknown): boolean {
    if (!error || typeof error !== 'object' || !('code' in error)) {
        return false;
    }
    return error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'EISDIR';
}
