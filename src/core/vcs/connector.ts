import type {Run} from '~/core/run';
import type {VcsServiceConfig} from '~/core/vcs/VcsService';
import type {VcsConnector} from './types';

import {join} from 'node:path';

export class DefaultVcsConnector implements VcsConnector {
    private run: Run<VcsServiceConfig>;

    constructor(run: Run<VcsServiceConfig>) {
        this.run = run;
    }

    getData() {
        return {
            mtimes: {},
            authors: {},
            contributors: {},
        };
    }

    setData() {}

    async getBase() {
        return '.' as RelativePath;
    }

    async getContributorsByPath() {
        return [];
    }

    async getModifiedTimeByPath(path: RelativePath) {
        const stat = await this.run.fs.stat(join(this.run.originalInput, path));

        return Math.round(stat.mtimeMs / 1000);
    }

    async getAuthorByPath() {
        return null;
    }

    async getUserByLogin() {
        return null;
    }
}
