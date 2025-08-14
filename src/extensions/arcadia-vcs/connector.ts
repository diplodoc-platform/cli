import type {Run} from '@diplodoc/cli/lib/run';
import type {Contributor, SyncData, VcsConnector} from '@diplodoc/cli/lib/vcs';
import type {Config} from './types';

import {join} from 'node:path';
import {uniqBy} from 'lodash';
import {bounded, normalizePath} from '@diplodoc/cli/lib/utils';

import {ArcClient} from './arc-client';

export class ArcadiaVcsConnector implements VcsConnector {
    private authorByPath: Record<NormalizedPath, Contributor> = {};

    private contributorsByPath: Record<NormalizedPath, Contributor[]> = {};

    private mtimeByPath: Record<NormalizedPath, number> = {};

    private config: Config;

    private arc: ArcClient;

    constructor(run: Run<Config>) {
        this.config = run.config;
        this.arc = new ArcClient(this.config, run.originalInput);
    }

    async init() {
        const {mtimes, authors, contributors} = this.config;

        await Promise.all(
            [
                mtimes.enabled && this.fillMTimes(),
                authors.enabled && this.fillAuthors(),
                contributors.enabled && this.fillContributors(),
            ].filter(Boolean),
        );

        return this;
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

    getBase() {
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
}
