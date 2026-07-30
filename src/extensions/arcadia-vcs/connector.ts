import type {Run} from '@diplodoc/cli/lib/run';
import type {Contributor, SyncData, VcsConnector} from '@diplodoc/cli/lib/vcs';
import type {ArcadiaVcsCache, Config} from './types';

import {dirname} from 'node:path';
import {uniqBy} from 'lodash';

import {bounded, normalizePath} from '@diplodoc/cli/lib/utils';
import {configPath} from '@diplodoc/cli/lib/config';

import {ArcClient, ArcadiaVcsCacheScopesError} from './arc-client';
import {ArcadiaVcsCacheStore} from './cache-store';

export class ArcadiaVcsConnector implements VcsConnector {
    private authorByPath: Record<NormalizedPath, Contributor> = {};

    private contributorsByPath: Record<NormalizedPath, Contributor[]> = {};

    private mtimeByPath: Record<NormalizedPath, number> = {};

    private config: Config;

    private arc: ArcClient;

    private cacheStore?: ArcadiaVcsCacheStore;

    private root: AbsolutePath;

    private run: Run<Config>;

    private arcAvailable = false;

    private cacheReady = false;

    constructor(run: Run<Config>) {
        this.run = run;
        this.config = run.config;
        this.root = dirname(run.config[configPath] as AbsolutePath) as AbsolutePath;
        this.arc = new ArcClient(run.config, this.root);
        if (run.config.vcs?.cache) {
            const output = (run as Run<Config> & {output: AbsolutePath}).output;
            this.cacheStore = new ArcadiaVcsCacheStore(
                run.config.vcs.cache,
                this.root,
                output,
                (message) => run.logger.warn(message),
            );
        }
    }

    async init() {
        const {mtimes, authors, contributors} = this.config;
        let cache: ArcadiaVcsCache | undefined;

        try {
            cache = await this.cacheStore?.load();
            if (cache) {
                this.arc = new ArcClient(this.config, this.root, cache);
            }
            await Promise.all(
                [
                    mtimes.enabled && this.fillMTimes(),
                    authors.enabled && this.fillAuthors(),
                    contributors.enabled && this.fillContributors(),
                ].filter(Boolean),
            );
            this.arcAvailable = true;
            this.cacheReady = Boolean(this.cacheStore);
        } catch (error) {
            if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
                this.run.logger.warn(
                    'Arcadia VCS extension disabled: arc is not available in this environment.',
                );
                return this;
            }
            if (cache && !(error instanceof ArcadiaVcsCacheScopesError)) {
                await this.restoreCache(cache);
                this.arcAvailable = true;
                this.run.logger.warn(
                    `Arcadia VCS incremental update failed; using cached VCS metadata: ${error}`,
                );
                return this;
            }
            throw error;
        }

        return this;
    }

    async flushCache() {
        if (!this.cacheStore || !this.cacheReady) {
            return;
        }

        await this.cacheStore.save(await this.arc.getCache());
    }

    getData() {
        return {
            mtimes: this.mtimeByPath,
            authors: this.authorByPath,
            contributors: this.contributorsByPath,
        };
    }

    setData(data: SyncData) {
        this.mtimeByPath = data.mtimes;
        this.authorByPath = data.authors;
        this.contributorsByPath = data.contributors;
    }

    async getBase() {
        if (!this.arcAvailable) {
            return '.' as NormalizedPath;
        }

        return this.arc.getBase();
    }

    @bounded
    async getUserByLogin(login: string): Promise<Contributor> {
        return {
            login,
            url: `https://staff.yandex-team.ru/${login}`,
            avatar: `https://center.yandex-team.ru/api/v1/user/${login}/avatar/60.jpg`,
            email: `${login}@yandex-team.ru`,
            name: '',
        };
    }

    @bounded
    async getAuthorByPath(path: RelativePath): Promise<Contributor | null> {
        const file = normalizePath(path);
        return this.authorByPath[normalizePath(file)] ?? null;
    }

    @bounded
    async getContributorsByPath(path: RelativePath, deps: RelativePath[]): Promise<Contributor[]> {
        const author = await this.getAuthorByPath(path);
        const result: Contributor[] = [];

        result.push(...(this.contributorsByPath[normalizePath(path)] || []));
        for (const dep of deps) {
            result.push(...(this.contributorsByPath[normalizePath(dep)] || []));
        }

        return uniqBy(result.filter(Boolean), ({login}) => login).filter(
            ({login}) => login !== author?.login,
        );
    }

    @bounded
    async getModifiedTimeByPath(path: RelativePath) {
        const file = normalizePath(path);
        return this.mtimeByPath[file] ?? null;
    }

    private async fillAuthors() {
        const authors = await this.arc.getAuthors();
        for (const [path, info] of Object.entries(authors)) {
            this.authorByPath[path as NormalizedPath] = await this.getUserByLogin(info.login);
        }
    }

    private async fillContributors() {
        const contributors = await this.arc.getContributors();
        for (const [path, infos] of Object.entries(contributors)) {
            const users = await Promise.all(infos.map(({login}) => this.getUserByLogin(login)));
            const prev = this.contributorsByPath[path as NormalizedPath] || [];
            this.contributorsByPath[path as NormalizedPath] = prev.concat(users);
        }
    }

    private async fillMTimes() {
        this.mtimeByPath = await this.arc.getMTimes();
    }

    private async restoreCache(cache: ArcadiaVcsCache) {
        if (this.config.mtimes.enabled) {
            this.mtimeByPath = {...cache.mtimes} as Record<NormalizedPath, number>;
        }
        if (this.config.authors.enabled) {
            for (const [path, info] of Object.entries(cache.authors)) {
                this.authorByPath[path as NormalizedPath] = await this.getUserByLogin(info.login);
            }
        }
        if (this.config.contributors.enabled) {
            for (const [path, infos] of Object.entries(cache.contributors)) {
                this.contributorsByPath[path as NormalizedPath] = await Promise.all(
                    infos.map(({login}) => this.getUserByLogin(login)),
                );
            }
        }
    }
}
