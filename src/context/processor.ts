import { DependencyContext } from '@diplodoc/transform/lib/typings';
import {RevisionContext} from './context';

type FileQueueProcessorFn = (path: string) => (Promise<void> | void);

export class FileQueueProcessor {
    private context: RevisionContext;
    private deps: DependencyContext;

    private processed = new Set<string>();
    private whiteQueue: string[] = [];

    constructor(context: RevisionContext, deps: DependencyContext) {
        this.context = context;
        this.deps = deps;
    }

    getFilesToProcess(navigationPaths: string[] = []) {
        const files = Object.keys(this.context.meta?.files || {})
            .filter(path => this.context.meta?.files[path].changed !== false);
    
        for (const path of navigationPaths) {
            if (this.context.meta?.files[path]?.changed !== false) {
                this.whiteQueue.push(path);
            }
        }

        return files;
    }

    addDepsToQueue(path: string) {
        const dependencies = Object.keys(this.context.meta?.files || {})
            .filter(file => this.context.meta?.files[file].files.includes(path));
        
        for (const file of dependencies) {
            if (!this.processed.has(file)) {
                if (this.context.meta?.files[file]) {
                    this.context.meta.files[file].changed = true;
                }
                this.whiteQueue.push(file);
            }
        }
    }
    
    async processQueue(fn: FileQueueProcessorFn, files: string[] = []) {
        this.whiteQueue = files;
        
        let file = this.whiteQueue.shift();

        while (file) {
            if (!this.processed.has(file)) {
                this.processed.add(file);
                this.deps.resetDeps?.(file);
                await fn(file);
                this.addDepsToQueue(file);
            }
            file = this.whiteQueue.shift();
        }
    }
}