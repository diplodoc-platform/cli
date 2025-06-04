import type {Run as BaseRun} from '~/core/run';
import type {TocService} from '~/core/toc';
import type {Contributor, SyncData, VcsConnector, VcsMetadata} from './types';

import {memoize, normalizePath} from '~/core/utils';

import {getHooks, withHooks} from './hooks';
import {DefaultVcsConnector} from './connector';

export type VcsServiceConfig = {
    mtimes: {enabled: boolean};
    authors: {enabled: boolean; ignore: string[]};
    contributors: {enabled: boolean; ignore: string[]};
    vcs: {
        enabled: boolean;
        /**
         * Externally accessible base URI for a resource where a particular documentation
         * source is hosted.
         *
         * This configuration parameter is used to directly control the Edit button behaviour
         * in the Diplodoc documentation viewer(s).
         *
         * For example, if the following applies:
         * - Repo with doc source is hosted on GitHub (say, https://github.com/foo-org/bar),
         * - Within that particular repo, the directory that is being passed as an `--input`
         *   parameter to the CLI is located at `docs/`,
         * - Whenever the Edit button is pressed, you wish to direct your readers to the
         *   respective document's source on `main` branch
         *
         * you should pass `https://github.com/foo-org/bar/tree/main/docs` as a value for this parameter.
         */
        remoteBase?: string;
    } & Hash;
};

type Meta = {
    author?: string | Contributor;
    sourcePath?: string;
    vcsPath?: string;
};

type Run = BaseRun<VcsServiceConfig> & {
    toc: TocService;
};

@withHooks
export class VcsService implements VcsConnector {
    readonly name = 'Vcs';

    readonly run: Run;

    readonly config: VcsServiceConfig;

    private connector: VcsConnector;

    constructor(run: Run) {
        this.run = run;
        this.connector = new DefaultVcsConnector(run);
        this.config = run.config;
    }

    async init() {
        if (!this.config.vcs.enabled) {
            return;
        }

        this.connector = await getHooks(this).VcsConnector.promise(this.connector);
    }

    getData() {
        return this.connector.getData();
    }

    setData(data: SyncData) {
        this.connector.setData(data);
    }

    async metadata(path: RelativePath, meta: Meta, deps: NormalizedPath[] = []) {
        const file = normalizePath(path);
        const addVCSPath = Boolean(this.config.vcs.remoteBase);

        const result: VcsMetadata = {};

        // TODO: resolve meta.vcsPath || meta.sourcePath on server side
        if (addVCSPath) {
            const sourcePath = normalizePath(
                meta.vcsPath || meta.sourcePath || this.realpath(file),
            );
            result.vcsPath = sourcePath;
            result.sourcePath = sourcePath;
        }

        const [author, contributors, updatedAt] = await Promise.all([
            this.config.authors.enabled ? this.getAuthor(file, meta?.author) : undefined,
            this.config.contributors.enabled ? this.getContributors(file, deps) : [],
            this.config.mtimes.enabled ? this.getMTime(file, deps) : undefined,
        ]);

        result.author = author || undefined;
        result.contributors = contributors.length ? contributors : undefined;
        result.updatedAt = updatedAt || undefined;

        return result;
    }

    async getContributorsByPath(
        path: RelativePath,
        deps: RelativePath[] = [],
    ): Promise<Contributor[]> {
        return this.connector.getContributorsByPath(this.run.normalize(path), deps);
    }

    async getModifiedTimeByPath(path: RelativePath) {
        return this.connector.getModifiedTimeByPath(this.run.normalize(path));
    }

    async getAuthorByPath(path: RelativePath) {
        return this.connector.getAuthorByPath(this.run.normalize(path));
    }

    async getUserByLogin(author: string) {
        return this.connector.getUserByLogin(author);
    }

    private async getAuthor(
        path: NormalizedPath,
        author: string | Contributor | null | undefined,
    ): Promise<Contributor | null> {
        if (!author) {
            return this.getAuthorByPath(path);
        }

        if (typeof author === 'object') {
            return author;
        }

        try {
            return JSON.parse(author);
        } catch {
            return this.getUserByLogin(author);
        }
    }

    @memoize('path')
    private async getContributors(
        path: NormalizedPath,
        deps: NormalizedPath[],
    ): Promise<Contributor[]> {
        const contributors = await this.getContributorsByPath(path, deps);

        return Object.values(contributors);
    }

    @memoize('path')
    private async getMTime(path: NormalizedPath, deps: NormalizedPath[]) {
        const mtimes = [];
        const files = [path].concat(deps);

        for (const file of files) {
            const realpath = await this.realpath(file);
            const mtime = await this.getModifiedTimeByPath(realpath);

            if (typeof mtime === 'number') {
                mtimes.push(mtime);
            }
        }

        if (!mtimes.length) {
            return undefined;
        }

        return new Date(Math.max(...mtimes) * 1000).toISOString();
    }

    private realpath(file: NormalizedPath) {
        const copymap = this.run.toc.copymap;

        while (copymap[file]) {
            file = copymap[file];
        }

        return file;
    }
}
