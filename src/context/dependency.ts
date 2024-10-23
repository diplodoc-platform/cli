import {resolve} from 'path';
import {DependencyContext} from '@diplodoc/transform/lib/typings';
import {RevisionContext} from './context';

export class DependencyContextCli implements DependencyContext {
    private context: RevisionContext;

    constructor(context: RevisionContext) {
        this.context = context;
    }

    getAssetPath(path: string) {
        const isFromTmpInputFolder = path.startsWith(resolve(this.context.tmpInputFolder) + '/');
        if (isFromTmpInputFolder) {
            const assetPath = path.replace(resolve(this.context.tmpInputFolder) + '/', '');
            return assetPath;
        }

        const isFromInputFolder = path.startsWith(resolve(this.context.userInputFolder) + '/');
        if (isFromInputFolder) {
            const assetPath = path.replace(resolve(this.context.userInputFolder) + '/', '');
            return assetPath;
        }

        return path;
    }

    markDep(path: string, dependencyPath: string, type?: string): void {
        type = type ?? 'include';

        const assetPath = this.getAssetPath(path);
        const depAssetPath = this.getAssetPath(dependencyPath);

        if (assetPath && depAssetPath && this.context?.meta?.files?.[assetPath]) {
            const dependencies = this.context.meta.files[assetPath].dependencies[type] ?? [];
            const array = [...dependencies, depAssetPath];
            this.context.meta.files[assetPath].dependencies[type] = [...new Set(array)];
        }
    }

    unmarkDep(path: string, dependencyPath: string, type?: string): void {
        type = type ?? 'include';

        const assetPath = this.getAssetPath(path);
        const depAssetPath = this.getAssetPath(dependencyPath);

        if (assetPath && depAssetPath && this.context?.meta?.files?.[assetPath]) {
            const dependencies = this.context.meta.files[assetPath].dependencies[type] ?? [];
            this.context.meta.files[assetPath].dependencies[type] = dependencies.filter(
                (file) => file !== depAssetPath,
            );
        }
    }

    resetDeps(path: string): void {
        const assetPath = this.getAssetPath(path);

        if (assetPath && this.context?.meta?.files?.[assetPath]) {
            this.context.meta.files[assetPath].dependencies = {};
        }
    }
}
