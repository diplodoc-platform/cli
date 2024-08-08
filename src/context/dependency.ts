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
        return null;
    }

    markDep(path: string, dependencyPath: string): void {
        const assetPath = this.getAssetPath(path);
        const depAssetPath = this.getAssetPath(dependencyPath);

        if (assetPath && depAssetPath && this.context?.meta?.files[assetPath]) {
            const array = [...this.context.meta.files[assetPath].files, depAssetPath];
            this.context.meta.files[assetPath].files = [...new Set(array)];
        }
    }

    unmarkDep(path: string, dependencyPath: string): void {
        const assetPath = this.getAssetPath(path);
        const depAssetPath = this.getAssetPath(dependencyPath);

        if (assetPath && depAssetPath && this.context?.meta?.files[assetPath]) {
            this.context.meta.files[assetPath].files = this.context.meta.files[assetPath].files
                .filter(file => file !== depAssetPath);
        }
    }

    markVars(path: string, ...names: string[]): void {
        const assetPath = this.getAssetPath(path);

        if (assetPath && this.context?.meta?.files[assetPath]) {
            const array = [...this.context.meta.files[assetPath].vars, ...names];
            this.context.meta.files[assetPath].vars = [...new Set(array)];
        }
    }

    unmarkVars(path: string, ...names: string[]): void {
        const assetPath = this.getAssetPath(path);

        if (assetPath && this.context?.meta?.files[assetPath]) {
            this.context.meta.files[assetPath].vars = this.context.meta.files[assetPath].vars
                .filter(name => !names.includes(name));
        }
    }
}