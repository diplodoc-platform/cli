import type {SearchProvider} from './types';

export class DefaultSearchProvider implements SearchProvider {
    async add() {}

    async release() {}

    config() {
        return {enabled: false};
    }
}
