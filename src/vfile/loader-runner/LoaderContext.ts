import type { Loader } from './LoaderClass';
import { dirname } from 'path';
import { parsePathQueryFragment } from './utils';
import { loader, LoaderData } from './loader';
import { MultiResultCallback } from './runLoaders';

function get(box: any, path: string) {
    if (box && typeof box === 'object') {
        return box[path];
    }
}

export class LoaderContext {

    readonly fileDependencies: string[] = [];

    readonly missingDependencies: string[] = [];

    requestCacheable = true;

    resourcePath = '';

    resourceQuery = '';

    resourceFragment = '';

    context: string;

    loaderIndex = 0;

    loaders: Loader[];

    async: null | (() => void) = null;

    callback: null | MultiResultCallback = null;

    constructor(resource: undefined | string, loaders: LoaderData[]) {
        this.resource = resource;

        this.context = dirname(this.resourcePath);
        this.loaders = loaders.map(loader);
    }

    get resource() {
        if (this.resourcePath === undefined) {
            return undefined;
        }

        return [
            this.resourcePath.replace(/#/g, '\0#'),
            this.resourceQuery?.replace(/#/g, '\0#') || '',
            this.resourceFragment || ''
        ].join('');
    }

    set resource(value) {
        const splittedResource = value && parsePathQueryFragment(value);

        this.resourcePath = get(splittedResource, 'path');
        this.resourceQuery = get(splittedResource, 'query');
        this.resourceFragment = get(splittedResource, 'fragment');
    }

    get request() {
        return this.loaders
            .map(loader => loader.request)
            .concat(this.resource || '')
            .join('!');
    }

    get remainingRequest() {
        if (this.loaderIndex >= this.loaders.length - 1 && !this.resource) {
            return '';
        }

        return this.loaders
            .slice(this.loaderIndex + 1)
            .map(loader => loader.request)
            .concat(this.resource || '')
            .join('!');
    }

    get currentRequest() {
        return this.loaders
            .slice(this.loaderIndex)
            .map(loader => loader.request)
            .concat(this.resource || '')
            .join('!');
    }

    get previousRequest() {
        return this.loaders
            .slice(0, this.loaderIndex)
            .map(loader => loader.request)
            .join('!');
    }

    get query() {
        const entry = this.loaders[this.loaderIndex];

        return entry.options && typeof entry.options === 'object'
            ? entry.options
            : entry.query;
    }

    get data() {
        return this.loaders[this.loaderIndex].data;
    }

    cacheable(flag: any) {
        if (flag === false) {
            this.requestCacheable = false;
        }
    }

    addDependency(file: string) {
        this.fileDependencies.push(file);
    }

    addMissingDependency(context: string) {
        this.missingDependencies.push(context);
    }

    getDependencies() {
        return this.fileDependencies.slice();
    }

    getMissingDependencies() {
        return this.missingDependencies.slice();
    }

    clearDependencies() {
        this.fileDependencies.length = 0;
        this.missingDependencies.length = 0;
        this.requestCacheable = true;
    }
}