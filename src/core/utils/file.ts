import {normalizePath} from './path';
import {copyJson} from './common';

type Formatter<T, O> = (data: T) => O;

const toString = <T>(data: T) => {
    if (typeof data === 'string') {
        return data;
    }

    return JSON.stringify(data);
};

export class VFile<T extends string | object = string | object, Info extends Hash = {}> {
    get path(): NormalizedPath {
        return this._path;
    }

    set path(value: RelativePath) {
        this._path = normalizePath(value);
    }

    get data() {
        return this._data;
    }

    set data(value: T) {
        this._data = value;
    }

    get info() {
        return this._info;
    }

    set info(value: Info) {
        this._info = value;
    }

    private _path: NormalizedPath;

    private _data: T;

    private _info: Info = {} as Info;

    private _format: Formatter<T, string>;

    constructor(path: RelativePath, data: T, formatter: Formatter<T, string> = toString) {
        this._path = normalizePath(path);
        this._data = data;
        this._format = formatter;
    }

    copy(path?: RelativePath) {
        const data = typeof this._data === 'string' ? this._data : copyJson(this._data);
        return new VFile<T>(path || this._path, data as T, this._format);
    }

    format(formatter: Formatter<T, string>) {
        this._format = formatter;
    }

    toString() {
        return this._format(this._data);
    }
}
