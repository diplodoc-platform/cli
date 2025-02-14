import {VcsConnector} from './types';

export class DefaultVcsConnector implements VcsConnector {
    async getContributorsByPath() {
        return [];
    }

    async getModifiedTimeByPath() {
        return null;
    }

    async getAuthorByPath() {
        return null;
    }

    async getUserByLogin() {
        return null;
    }
}
