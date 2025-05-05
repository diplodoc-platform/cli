import {SearchProvider} from './types';

export class DefaultSearchProvider implements SearchProvider {
    getIndexedCount(): number {
        return 0;
    }
    async add() {}

    async release() {}

    config() {
        return {
            enabled: false,
            // TODO: this is field of Local implementation
            // We need to add extention point to page template and remove this from abstract provider
            resources: '',
        };
    }
}
