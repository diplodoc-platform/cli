import type {Run} from '~/commands/build';
import type {FSWatcher} from 'chokidar';

import {relative} from 'node:path';
import chokidar from 'chokidar';
import {Defer, normalizePath} from '~/core/utils';

type Event = {
    type: 'add' | 'unlink' | 'change';
    file: NormalizedPath;
};

export class Watcher {
    readonly events: AsyncIterable<Event>;

    private watcher: FSWatcher;

    constructor(run: Run) {
        this.watcher = chokidar.watch(run.originalInput, {ignoreInitial: true});

        let event = new Defer<Event | null>();
        let wait = new Defer<void>();

        const queue: Event[] = [];

        let busy = false;
        async function unqueue() {
            if (busy) {
                return;
            }
            busy = true;
            while (queue.length) {
                event.resolve(queue.shift() as Event);
                await wait.promise;
            }
            busy = false;
        }

        this.watcher.on('all', (type: Event['type'], path: AbsolutePath) => {
            const file = normalizePath(relative(run.originalInput, path));
            queue.push({type, file});
            unqueue();
        });

        this.events = (async function* () {
            let value: Event | null = null;

            // eslint-disable-next-line no-cond-assign
            while ((value = await event.promise)) {
                event = new Defer<Event | null>();

                yield value;

                wait.resolve();
                wait = new Defer();
            }
        })();
    }
}
