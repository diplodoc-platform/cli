import type {Run} from '~/core/run';
import type {Contributor, Contributors, VcsConnector} from './types';

import {ok} from 'node:assert';
import {dirname, join, relative} from 'node:path';

import {memoize, own} from '~/core/utils';

import {Hooks, hooks} from './hooks';
import {DefaultVcsConnector} from './connector';

type Config = {
    contributors: boolean;
    vcs: {
        type: string;
    } & Hash;
};

type Meta = {
    author?: string | Contributor;
};

// Include example: {% include [createfolder](create-folder.md) %}
// Regexp result: [createfolder](create-folder.md)
export const REGEXP_INCLUDE_CONTENTS = /(?<=[{%]\sinclude\s).+(?=\s[%}])/gm;

// Include example: [createfolder](create-folder.md)
// Regexp result: create-folder.md
export const REGEXP_INCLUDE_FILE_PATH = /(?<=[(]).+(?=[)])/g;

export class VcsService implements VcsConnector {
    readonly [Hooks] = hooks();

    readonly run: Run<Config>;

    readonly config: Config;

    private connector: VcsConnector = new DefaultVcsConnector();

    get enabled() {
        return this.config.contributors && this.connector;
    }

    constructor(run: Run<Config>) {
        this.run = run;
        this.config = run.config;
    }

    async init() {
        const type = this.config.vcs.type;
        if (!type) {
            return;
        }

        const hook = this[Hooks].VcsConnector.get(type);
        ok(hook, `VCS connector for '${type}' is not registered.`);

        this.connector = await this[Hooks].VcsConnector.for(type).promise(this.connector);
    }

    async metadata(path: RelativePath, meta: Meta, content: string) {
        if (!this.enabled) {
            return {};
        }

        const [author, contributors, updatedAt] = await Promise.all([
            this.getAuthor(path, meta?.author),
            this.getContributors(path, content),
            this.getMTime(path, content),
        ]);

        return {
            author: author || undefined,
            contributors: contributors.length ? contributors : undefined,
            updatedAt: updatedAt || undefined,
        };
    }

    async getContributorsByPath(
        path: RelativePath,
        deps: RelativePath[] = [],
    ): Promise<Contributors> {
        return this.connector.getContributorsByPath(this.run.normalize(path), deps);
    }

    async getModifiedTimeByPath(path: RelativePath) {
        return this.connector.getModifiedTimeByPath(this.run.normalize(path));
    }

    async getUserByPath(path: RelativePath) {
        return this.connector.getUserByPath(this.run.normalize(path));
    }

    async getUserByLogin(author: string) {
        return this.connector.getUserByLogin(author);
    }

    private async getAuthor(
        path: RelativePath,
        author: string | Contributor | null | undefined,
    ): Promise<Contributor | null> {
        if (!author) {
            return this.getUserByPath(path);
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
    private async getContributors(path: RelativePath, content: string): Promise<Contributor[]> {
        const includes = await this.getIncludes(path, content);
        const contributors = await this.getContributorsByPath(path, includes);

        return Object.values(contributors);
    }

    @memoize('path')
    private async getMTime(path: RelativePath, content: string) {
        const mtimes = [];
        const files = [path].concat(await this.getIncludes(path, content));

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

    @memoize('path')
    private async getIncludes(
        path: RelativePath,
        content: string,
        results = new Set<RelativePath>(),
    ): Promise<RelativePath[]> {
        const includes = content.match(REGEXP_INCLUDE_CONTENTS);
        if (!includes || includes.length === 0) {
            return [...results];
        }

        const includesPaths = getIncludesPaths(path, includes);
        for (const includePath of includesPaths) {
            if (results.has(path)) {
                continue;
            }
            results.add(path);

            try {
                const includeContent = await this.run.read(join(this.run.input, includePath));

                await this.getIncludes(includePath, includeContent, results);
            } catch (error) {
                if (own(error, 'code') && error.code === 'ENOENT') {
                    continue;
                }

                throw error;
            }
        }

        return [...results];
    }
}

function getIncludesPaths(path: RelativePath, includes: string[]): RelativePath[] {
    const results: Set<RelativePath> = new Set();

    for (const include of includes) {
        const includeMatch = include.match(REGEXP_INCLUDE_FILE_PATH);

        if (includeMatch && includeMatch.length !== 0) {
            const includePath = includeMatch[0].split('#')[0];

            results.add(join(dirname(path), includePath));
        }
    }

    return [...results];
}
