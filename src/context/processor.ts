import {sep} from 'path';
import {DependencyContext} from '@diplodoc/transform/lib/typings';
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
            .filter(path => {
                if (this.context.meta?.files?.[path].changed !== false) {
                    const names = path.split(sep);
                    if (names.find(name => name.startsWith('_'))) {
                        return true;
                    }
                }
                return false;
            });
    
        for (const path of navigationPaths) {
            if (this.context.meta?.files?.[path]?.changed !== false) {
                files.push(path);
            }
        }

        return files;
    }

    addDepsToQueue(path: string) {
        const dependencies = Object.keys(this.context.meta?.files || {})
            .filter(file => {
                const dependencies = this.context.meta?.files?.[file]?.dependencies;
                return dependencies?.['include']?.includes(path)
                    || dependencies?.['toc']?.includes(path)
                    || dependencies?.['presets']?.includes(path);
            });
        
        for (const file of dependencies) {
            if (!this.processed.has(file)) {
                if (this.context.meta?.files?.[file]) {
                    this.context.meta.files[file].changed = true;
                }
                this.whiteQueue.push(file);
            }
        }
    }
    
    async processQueue(fn: FileQueueProcessorFn, files: string[] = []) {
        this.whiteQueue = files;
        
        let file = this.whiteQueue.shift();

        while (file !== undefined && file !== null) {
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