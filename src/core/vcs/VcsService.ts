import type {Run} from '~/commands/build';
import type {Contributors, FileContributors} from './types';
import type {VCSConnector} from '~/vcs-connector/connector-models';

import {ok} from 'node:assert';
import {normalizePath} from '~/utils';

import {Hooks, hooks} from './hooks';

export class VcsService {
    readonly [Hooks] = hooks();

    readonly run: Run;

    readonly config: Run['config'];

    private connector: VCSConnector | null | undefined;

    get enabled() {
        return this.config.contributors && this.connector;
    }

    constructor(run: Run) {
        this.run = run;
        this.config = run.config;
    }

    async init() {
        this.connector = await this[Hooks].VCSConnector.promise(null, this.config);
    }

    async getContributorsByPath(path: RelativePath): Promise<FileContributors> {
        const file = normalizePath(path);

        ok(this.connector, 'VCSConnector is not resolved');

        return this.connector.getContributorsByPath(file);
    }

    async getModifiedTimeByPath(path: RelativePath) {
        const file = normalizePath(path);

        ok(this.connector, 'VCSConnector is not resolved');

        return this.connector.getModifiedTimeByPath(file);
    }

    addNestedContributorsForPath(path: RelativePath, contributors: Contributors) {
        const file = normalizePath(path);

        ok(this.connector, 'VCSConnector is not resolved');

        return this.connector.addNestedContributorsForPath(file, contributors);
    }

    async getUserByPath(path: RelativePath) {
        const file = normalizePath(path);

        ok(this.connector, 'VCSConnector is not resolved');

        return this.connector.getExternalAuthorByPath(file);
    }

    async getUserByLogin(author: string) {
        ok(this.connector, 'VCSConnector is not resolved');

        return this.connector.getUserByLogin(author);
    }
}
