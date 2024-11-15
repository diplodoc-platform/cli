import type { LoaderContext } from './LoaderContext';
import { parsePathQueryFragment } from './utils';

export type LoaderOptions = {
    loader: string;
    fragment?: string;
    type?: 'module' | 'common';
    options?: string | { ident: LoaderOptions['ident'] } | null;
    ident?: string;
}

export class Loader {
    // @ts-ignore
    path: string;
    // @ts-ignore
    query: string;
    // @ts-ignore
    fragment: string;
    options: undefined | LoaderOptions['options'];
    ident: undefined | string;
    normal: undefined | ((this: LoaderContext, source: string | Buffer, map: any, meta: Hash) => any) = undefined;
    pitch: undefined | ((this: LoaderContext, remaining: string, previous: string, data: Record<string, any>) => any) = undefined;
    raw: boolean | undefined = false;
    data: null | Hash = null;
    type: 'module' | 'common' = 'common';
    pitchExecuted: boolean = false;
    normalExecuted: boolean = false;

    constructor(loader: string | LoaderOptions) {
        this.request = loader;

        if (Object.preventExtensions) {
            Object.preventExtensions(this);
        }
    }

    get request(): string {
        return this.path.replace(/#/g, '\0#') + this.query.replace(/#/g, '\0#') + this.fragment;
    }

    set request(value: string | LoaderOptions) {
        if (typeof value === 'string') {
            const splittedRequest = parsePathQueryFragment(value);

            this.path = splittedRequest.path;
            this.query = splittedRequest.query;
            this.fragment = splittedRequest.fragment;
            this.options = undefined;
            this.ident = undefined;
        } else {
            if (!value.loader) {
                throw new Error('request should be a string or object with loader and options (' + JSON.stringify(value) + ')');
            }

            this.path = value.loader;
            this.fragment = value.fragment || '';
            this.type = value.type || 'common';
            this.options = value.options;
            this.ident = value.ident;

            if (this.options === null || this.options === undefined) {
                this.query = '';
            } else if (typeof this.options === 'string') {
                this.query = '?' + this.options;
            } else if (this.ident) {
                this.query = '??' + this.ident;
            } else if (typeof this.options === 'object' && this.options.ident) {
                this.query = '??' + this.options.ident;
            } else {
                this.query = '?' + JSON.stringify(this.options);
            }
        }
    }
}