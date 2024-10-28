import {DependencyContext} from '@diplodoc/transform/lib/typings';
import {logger} from '~/utils/logger';
import {Queue} from '~/utils/queue';
import {RevisionContext} from './context';

const PAGES_ACTIVE_QUEUE_LENGTH = 200;

type FileQueueProcessorFn = (path: string) => Promise<void> | void;

// Processor allows to process files in parallel via PAGES_ACTIVE_QUEUE_LENGTH limit
// - it uses Queue engine as processor.
// - it has white queue to collect dependencies and puts them in the stack to avoid dead lock by the queue limit
export class FileQueueProcessor {
    private context: RevisionContext;
    private deps: DependencyContext;

    private processed = new Set<string>();
    private navigationPaths = new Set<string>();

    constructor(context: RevisionContext, deps: DependencyContext) {
        this.context = context;
        this.deps = deps;
    }

    // Set entry files
    setNavigationPaths(navigationPaths: string[]) {
        this.navigationPaths = new Set(navigationPaths);
    }

    // Without 'cached' option all the files are changed
    isChanged(path: string) {
        return this.context.meta?.files?.[path]?.changed !== false;
    }

    // Processable file is the entry file
    isProcessable(pattern: string) {
        return this.navigationPaths.has(pattern);
    }

    // Main process function
    async processQueue(fn: FileQueueProcessorFn) {
        const files = this.getFilesToProcess();

        if (files.length > 0) {
            let index = 0;
            const queue = new Queue(
                async (file: string) => {
                    if (!this.processed.has(file)) {
                        this.processed.add(file);
                        this.deps.resetDeps?.(file);

                        // Check that the file is the entry file
                        if (this.isProcessable(file)) {
                            logger.prog(index, this.navigationPaths.size, file);
                            index++;

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

    // Get initial file queue
    private getFilesToProcess() {
        const files = new Set(
            Object.keys(this.context.meta?.files || {}).filter((path) => this.isChanged(path)),
        );

        for (const path of this.navigationPaths) {
            if (this.isChanged(path)) {
                files.add(path);
            }
        }

        return [...files];
    }

    // Find the dependency file and add them to queue
    private addDepsToQueue(path: string, add: (path: string) => void) {
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
}
