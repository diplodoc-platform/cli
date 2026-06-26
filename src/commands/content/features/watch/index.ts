import type {FSWatcher} from 'chokidar';

import chokidar from 'chokidar';

/**
 * Minimal file watcher for the `content` command.
 *
 * Unlike the build `Watch` feature (which is coupled to toc/entry graphs and an
 * SSE dev-server), this one just observes an explicit set of files (the target
 * file, its includes and the relevant `presets.yaml`) and invokes `onChange` on
 * any event. New dependency paths can be added later via {@link ContentWatcher.add}.
 */
export class ContentWatcher {
    private readonly watcher: FSWatcher;

    constructor(paths: AbsolutePath[], onChange: (path: string) => void) {
        this.watcher = chokidar.watch(paths, {ignoreInitial: true});

        // @ts-ignore chokidar's `all` handler signature
        this.watcher.on('all', (_type: string, path: string) => onChange(path));
    }

    add(paths: AbsolutePath[]) {
        this.watcher.add(paths);
    }

    async close() {
        await this.watcher.close();
    }
}
