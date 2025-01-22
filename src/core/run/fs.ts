import {
    access,
    copyFile,
    link,
    mkdir,
    readFile,
    realpath,
    rm,
    stat,
    unlink,
    writeFile,
} from 'node:fs/promises';

export type FileSystem = {
    access: typeof access;
    stat: typeof stat;
    realpath: typeof realpath;
    link: typeof link;
    unlink: typeof unlink;
    copyFile: typeof copyFile;
    mkdir: typeof mkdir;
    rm: typeof rm;
    readFile: typeof readFile;
    writeFile: typeof writeFile;
};

export const fs = {
    access,
    stat,
    realpath,
    rm,
    link,
    unlink,
    copyFile,
    mkdir,
    readFile,
    writeFile,
};
