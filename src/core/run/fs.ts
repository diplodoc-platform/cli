import {
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

import {statSync} from 'node:fs';

export type FileSystem = {
    stat: typeof stat;
    statSync: typeof statSync;
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
    stat,
    statSync,
    realpath,
    rm,
    link,
    unlink,
    copyFile,
    mkdir,
    readFile,
    writeFile,
};
