import type {Run as BaseRun} from '~/core/run';
import type {TocService} from '~/core/toc';
import type {MetaService} from '~/core/meta';
import type {Contributor, SyncData, VcsConnector, VcsMetadata} from './types';

import {join} from 'node:path';

import {all, bounded, memoize, normalizePath} from '~/core/utils';

import {getHooks, withHooks} from './hooks';
import {DefaultVcsConnector} from './connector';

export type VcsServiceConfig = {
    vcsPath: {enabled: boolean};
    mtimes: {enabled: boolean};
    authors: {enabled: boolean; ignore: string[]};
    contributors: {enabled: boolean; ignore: string[]};
    vcs: {
        enabled: boolean;
    } & Hash;
};

type Run = BaseRun<VcsServiceConfig> & {
    toc: TocService;
    meta: MetaService;
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

    async metadata(path: RelativePath, deps: NormalizedPath[] = []) {
        const file = normalizePath(path);
        const meta = this.run.meta.get(file);

        const result: VcsMetadata = {};

        const [vcsPath, author, contributors, updatedAt] = await Promise.all([
            this.config.vcsPath.enabled ? this.realpath(file) : undefined,
            this.config.authors.enabled ? this.getAuthor(file, meta?.author) : undefined,
            this.config.contributors.enabled ? this.getContributors(file, deps) : [],
            this.config.mtimes.enabled ? this.getMTime(file, deps) : undefined,
        ]);

        result.vcsPath = vcsPath || undefined;
        result.author = author || undefined;
        result.contributors = contributors.length ? contributors : undefined;
        result.updatedAt = updatedAt || undefined;

        Object.assign(result, await this.getResources(file, result));

        return result;
    }

    @memoize()
    async getBase() {
        return this.connector.getBase();
    }

    async getContributorsByPath(
        path: RelativePath,
        deps: RelativePath[] = [],
    ): Promise<Contributor[]> {
        return this.connector.getContributorsByPath(
            await this.realpath(path),
            await all(deps.map(this.realpath)),
        );
    }

    async getModifiedTimeByPath(path: RelativePath) {
        return this.connector.getModifiedTimeByPath(await this.realpath(path));
    }

    async getAuthorByPath(path: RelativePath) {
        return this.connector.getAuthorByPath(await this.realpath(path));
    }

    async getUserByLogin(author: string) {
        return this.connector.getUserByLogin(author);
    }

    private async getResources(path: RelativePath, meta: VcsMetadata) {
        return this.connector.getResourcesByPath?.(path, meta) || {};
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
            const mtime = await this.getModifiedTimeByPath(file);

            if (typeof mtime === 'number') {
                mtimes.push(mtime);
            }
        }

        if (!mtimes.length) {
            return undefined;
        }

        return new Date(Math.max(...mtimes) * 1000).toISOString();
    }

    @bounded
    private async realpath(file: RelativePath): Promise<NormalizedPath> {
        const base = await this.getBase();
        const meta = this.run.meta.get(file);

        if (meta.vcsPath) {
            return normalizePath(meta.vcsPath);
        }

        if (meta.sourcePath) {
            return normalizePath(meta.sourcePath);
        }

        return normalizePath(join(base, file));
    }
}
