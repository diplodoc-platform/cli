import {RevisionContext} from './context';

type FileQueueProcessorFn = (path: string) => (Promise<void> | void);

export class FileQueueProcessor {
    private context: RevisionContext;

    private processed = new Set<string>();
    private whiteQueue: string[] = [];

    constructor(context: RevisionContext) {
        this.context = context;
    }

    addDepsToQueue(path: string) {
        const dependencies = Object.keys(this.context.meta.files)
            .filter(file => this.context.meta.files[file].files.includes(path));
        
        for (const file of dependencies) {
            if (!this.processed.has(file)) {
                this.context.meta.files[file].changed = true;
                this.whiteQueue.push(file);
            }
        }
    }
    
    async processQueue(fn: FileQueueProcessorFn, navigationPaths: string[] = []) {
        this.whiteQueue = Object.keys(this.context.meta.files)
            .filter(path => this.context.meta.files[path].changed !== false);
        
        for (const path of navigationPaths) {
            if (this.context.meta.files[path]?.changed !== false) {
                this.whiteQueue.push(path);
            }
        }
        
        let file = this.whiteQueue.shift();

        while (file) {
            await fn(file);
            this.processed.add(file);
            this.addDepsToQueue(file);
            file = this.whiteQueue.shift();
        }
    }
}