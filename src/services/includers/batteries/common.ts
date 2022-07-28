/* eslint-disable @typescript-eslint/no-explicit-any */
import {readdirSync} from 'fs';

function getDirs(path: string) {
    return readdirSync(path, {withFileTypes: true}).filter((i) => i.isDirectory());
}

function getFiles(path: string) {
    return readdirSync(path, {withFileTypes: true}).filter((i) => i.isFile());
}

const complement = (fn: Function) => (x: any) => !fn(x);

const isMdExtension = (str: string) => /.md$/gmu.test(str);

const isHidden = (str: string) => /^\./gmu.test(str);

const allPass = (predicates: Function[]) => (arg: any) =>
    predicates.map((fn) => fn(arg)).reduce((p, c) => p && c, true);

const compose = <R>(fn1: (a: R) => R, ...fns: Array<(a: R) => R>) =>
    fns.reduce((prevFn, nextFn) => (value) => prevFn(nextFn(value)), fn1);

const prop = (string: string) => (object: Object) => object[string as keyof typeof object];

export {complement, isMdExtension, isHidden, allPass, compose, prop, getDirs, getFiles};
