import {dirname, resolve} from 'path';
import {readFileSync} from 'fs';
import {safeLoad} from 'js-yaml';

class TocService {
    private readonly storage: Map<string, Object>;

    constructor() {
        this.storage = new Map();
    }

    parseFile(path: string, basePath: string = '') {
        const pathToDir: string = dirname(path);
        const content = readFileSync(resolve(basePath, path), 'utf8');
        const parsedToc = safeLoad(content);

        /* Store path to toc file to handle relative paths in navigation */
        parsedToc.base = pathToDir;

        const navigationItemQueue = [parsedToc];

        while (navigationItemQueue.length) {
            const navigationItem = navigationItemQueue.shift()!;

            if (navigationItem.items) {
                navigationItemQueue.push(...navigationItem.items);
            }

            if (navigationItem.href) {
                const key: string = `${pathToDir}/${navigationItem.href}`;
                this.storage.set(key, parsedToc);
            }
        }
    }

    getForPath(path: string): Object|undefined {
        return this.storage.get(path);
    }
}

export default new TocService();
