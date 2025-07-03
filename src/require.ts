import Module from 'node:module';
import {resolve} from 'node:path';

Module.prototype.require = ((original, map) =>
    Object.assign(function (this: Module, name: string) {
        return original.call(this, map[name] || name);
    }, original))(Module.prototype.require, {
    '@diplodoc/cli': resolve(__dirname, '..'),
} as Hash);
