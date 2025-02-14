import type {Run} from '~/core/run';
import type {Contributor, VcsConnector, VcsMetadata} from './types';

import {join, relative} from 'node:path';

import {memoize, normalizePath} from '~/core/utils';

import {getHooks, withHooks} from './hooks';
import {DefaultVcsConnector} from './connector';

export type VcsServiceConfig = {
    mtimes: boolean;
    authors: boolean;
    contributors: boolean;
    vcs: {
        enabled: boolean;
        type: string;
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

@withHooks
export class VcsService implements VcsConnector {
    readonly name = 'Vcs';

    readonly run: Run<VcsServiceConfig>;

    readonly config: VcsServiceConfig;

    private connector: VcsConnector = new DefaultVcsConnector();

    get connected() {
        return Boolean(this.connector && !(this.connector instanceof DefaultVcsConnector));
    }

    constructor(run: Run<VcsServiceConfig>) {
        this.run = run;
        this.config = run.config;
    }

    async init() {
        if (!this.config.vcs.enabled) {
            return;
        }

        const type = this.config.vcs.type;
        if (!type) {
            return;
        }

        this.connector = await getHooks(this).VcsConnector.for(type).promise(this.connector);
    }

    async metadata(path: RelativePath, meta: Meta, deps: NormalizedPath[] = []) {
        const file = normalizePath(path);
        const addVCSPath = Boolean(this.config.vcs.remoteBase);

        const result: VcsMetadata = {};

        // TODO: resolve meta.vcsPath || meta.sourcePath on server side
        if (addVCSPath) {
            result.vcsPath = normalizePath(meta.vcsPath || meta.sourcePath || file);
        }

        if (!this.connected) {
            return result;
        }

        const [author, contributors, updatedAt] = await Promise.all([
            this.config.authors ? this.getAuthor(file, meta?.author) : undefined,
            this.config.contributors ? this.getContributors(file, deps) : [],
            this.config.mtimes ? this.getMTime(file, deps) : undefined,
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
            const realpath = await this.run.realpath(join(this.run.input, file), false);
            const path = relative(this.run.originalInput, realpath);
            const mtime = await this.getModifiedTimeByPath(path);

            if (typeof mtime === 'number') {
                mtimes.push(mtime);
            }
        }

        if (!mtimes.length) {
            return undefined;
        }

        return new Date(Math.max(...mtimes) * 1000).toISOString();
    }
}
