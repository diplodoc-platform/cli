import {sep} from 'path';
import {DependencyContext} from '@diplodoc/transform/lib/typings';
import {logger} from '~/utils/logger';
import {Queue} from '~/utils/queue';
import {RevisionContext} from './context';

const PAGES_ACTIVE_QUEUE_LENGTH = 200;

type FileQueueProcessorFn = (path: string) => Promise<void> | void;

export class FileQueueProcessor {
    private context: RevisionContext;
    private deps: DependencyContext;

    private processed = new Set<string>();

    constructor(context: RevisionContext, deps: DependencyContext) {
        this.context = context;
        this.deps = deps;
    }

    getFilesToProcess(navigationPaths: string[] = []) {
        const files = Object.keys(this.context.meta?.files || {})
            .filter((path) => this.isChanged(path))
            .filter((path) => !this.isProcessable(path) || this.isInclude(path));

        for (const path of navigationPaths) {
            if (this.isChanged(path)) {
                files.push(path);
            }
        }
        // eslint-disable-next-line no-console
        console.log(files);

        return files;
    }

    addDepsToQueue(path: string, add: (path: string) => void) {
        const dependencies = Object.keys(this.context.meta?.files || {}).filter((file) => {
            const dependencies = this.context.meta?.files?.[file]?.dependencies;
            return (
                dependencies?.['include']?.includes(path) ||
                dependencies?.['toc']?.includes(path) ||
                dependencies?.['presets']?.includes(path)
            );
        });

        for (const file of dependencies) {
            if (!this.processed.has(file)) {
                if (this.context.meta?.files?.[file]) {
                    this.context.meta.files[file].changed = true;
                }
                add(file);
            }
        }
    }

    isChanged(path: string) {
        return this.context.meta?.files?.[path]?.changed !== false;
    }

    isInclude(path: string) {
        const names = path.split(sep);
        if (names.findIndex((name) => name.startsWith('_')) >= 0) {
            return true;
        }
        return false;
    }

    isProcessable(pattern: string) {
        if (pattern.endsWith('.yaml')) {
            return !this.isInclude(pattern);
        }

        return pattern.endsWith('.md');
    }

    async processQueue(fn: FileQueueProcessorFn, files: string[] = []) {
        if (files.length > 0) {
            const queue = new Queue(
                async (file: string) => {
                    if (!this.processed.has(file)) {
                        this.processed.add(file);
                        this.deps.resetDeps?.(file);
                        if (this.isProcessable(file)) {
                            await fn(file);
                        }
                        this.addDepsToQueue(file, queue.add);
                    }
                },
                PAGES_ACTIVE_QUEUE_LENGTH,
                (error, file) => logger.error(file, error.message),
            );

            files.forEach(queue.add);
            await queue.loop();
        }
    }
}
