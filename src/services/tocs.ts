import {dirname, resolve} from 'path';
import {readFileSync} from 'fs';
import {safeLoad} from 'js-yaml';

const storage: Map<string, Object> = new Map();

function add(path: string, basePath: string = '') {
    const pathToDir: string = dirname(path);
    const content = readFileSync(resolve(basePath, path), 'utf8');
    const parsedToc = safeLoad(content);

    /* Store path to toc file to handle relative paths in navigation */
    parsedToc.base = pathToDir;

    const navigationItemQueue = [parsedToc];

    while (navigationItemQueue.length) {
        const navigationItem = navigationItemQueue.shift()!;

        if (navigationItem.items) {
            const items = navigationItem.items.map(((item: any, index: number) => {
                // Generate personal id for each navigation item
                item.id = `${item.name}-${index}-${Math.random()}`;
                return item;
            }));
            navigationItemQueue.push(...items);
        }

        if (navigationItem.href) {
            const key: string = `${pathToDir}/${navigationItem.href}`;
            storage.set(key, parsedToc);
        }
    }
}

function getForPath(path: string): Object|undefined {
    return storage.get(path);
}

export default {
    add,
    getForPath,
};
