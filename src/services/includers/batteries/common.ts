/* eslint-disable @typescript-eslint/no-explicit-any */
const {promises: {readdir}} = require('fs');

async function getDirs(path: string) {
    const isDir = (i: any) => i.isDirectory();

    return readdir(path, {withFileTypes: true}).then((list: any) => list.filter(isDir));
}

async function getFiles(path: string) {
    const isFile = (i: any) => i.isFile();

    return readdir(path, {withFileTypes: true}).then((list: any) => list.filter(isFile));
}

const complement = (fn: Function) => (x: any) => !fn(x);

const isMdExtension = (str: string): boolean => /.md$/gmu.test(str);

const isHidden = (str: string) => /^\./gmu.test(str);

const allPass = (predicates: Function[]) => (arg: any) =>
    predicates.map((fn) => fn(arg)).reduce((p, c) => p && c, true);

const compose = <R>(fn1: (a: R) => R, ...fns: Array<(a: R) => R>) =>
    fns.reduce((prevFn, nextFn) => (value) => prevFn(nextFn(value)), fn1);

const prop = (string: string) => (object: Object) => object[string as keyof typeof object];

function concatNewLine(prefix: string, suffix: string) {
    return prefix.trim().length ? `${prefix}<br>${suffix}` : suffix;
}

export {complement, isMdExtension, isHidden, allPass, compose, prop, getDirs, getFiles, concatNewLine};
