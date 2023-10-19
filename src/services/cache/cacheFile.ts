import {ArgvService} from '../index';
import {CacheService} from './cache';
import {fileExists, getVarsPerFileWithHash} from '../../utils';
import isEqual from 'lodash/isEqual';
import * as fs from 'fs';
import path from 'path';
import {asyncify, mapLimit, parallelLimit} from 'async';
import {CacheFileData, CacheFileDataWithDeps, Deps} from './types';

const CUNCURRENCY = 1000;
const existsDir = new Set<string>();

type CacheFileProps = CacheFileData & Partial<Deps>;

class CacheFile {
    static from(data: CacheFileDataWithDeps, disabled: boolean, assetsDir: string) {
        return new CacheFile(data, disabled, assetsDir);
    }

    disabled = false;
    private assetsDir: string;
    private data: CacheFileDataWithDeps;
    private wroteFileData: Record<string, string | Uint8Array> = {};

    constructor(data: CacheFileProps, disabled: boolean, assetsDir: string) {
        this.assetsDir = assetsDir;
        this.disabled = disabled;
        this.data = {
            ...data,
            fileDeps: data.fileDeps || {},
            wroteFiles: data.wroteFiles || {},
            copiedFiles: data.copiedFiles || {},
            existsFiles: data.existsFiles || {},
            fileVarsDeps: data.fileVarsDeps || {},
        };
    }

    use() {
        if (this.disabled) {
            return undefined;
        }
        return this;
    }

    getKey() {
        return this.data.key;
    }

    toJSON(): CacheFileDataWithDeps {
        return this.data;
    }

    check() {
        const args = ArgvService.getConfig();
        const {input} = args;
        const root = path.resolve(input);

        const {fileDeps, copiedFiles, existsFiles, fileVarsDeps} = this.data;

        for (const filename in fileVarsDeps) {
            if (!Object.hasOwnProperty.call(fileVarsDeps, filename)) {
                continue;
            }

            const reqVarsHashList = fileVarsDeps[filename];
            const {varsHashList} = getVarsPerFileWithHash(filename);
            if (!isEqual(varsHashList, reqVarsHashList)) {
                return;
            }
        }

        for (const to in copiedFiles) {
            if (!Object.hasOwnProperty.call(copiedFiles, to)) {
                continue;
            }

            const from = copiedFiles[to];
            const filepath = path.join(root, from);
            if (!fs.existsSync(filepath)) {
                return;
            }
        }

        for (const filename in existsFiles) {
            if (!Object.hasOwnProperty.call(existsFiles, filename)) {
                continue;
            }

            const reqState = existsFiles[filename];
            const filepath = path.join(root, filename);
            if (fs.existsSync(filepath) !== reqState) {
                return;
            }
        }

        for (const filename in fileDeps) {
            if (!Object.hasOwnProperty.call(fileDeps, filename)) {
                continue;
            }

            const reqContentHash = fileDeps[filename];
            const filepath = path.join(root, filename);
            if (!fs.existsSync(filepath)) {
                return;
            }
            const contentHash = CacheService.getFileHash(filepath);
            if (contentHash !== reqContentHash) {
                return;
            }
        }

        return true;
    }

    async checkAsync() {
        const args = ArgvService.getConfig();
        const {input} = args;
        const root = path.resolve(input);

        const {fileDeps, copiedFiles, existsFiles, fileVarsDeps} = this.data;

        for (const filename in fileVarsDeps) {
            if (!Object.hasOwnProperty.call(fileVarsDeps, filename)) {
                continue;
            }

            const reqVarsHashList = fileVarsDeps[filename];
            const {varsHashList} = getVarsPerFileWithHash(filename);
            if (!isEqual(varsHashList, reqVarsHashList)) {
                return;
            }
        }

        const tasks: (() => Promise<void>)[] = [];

        Object.entries(copiedFiles).forEach(([, from]) =>
            tasks.push(
                asyncify(async () => {
                    const filepath = path.join(root, from);
                    const isExists = await fileExists(filepath);
                    if (!isExists) {
                        throw new Error('Aborted');
                    }
                }),
            ),
        );

        Object.entries(existsFiles).forEach(([filename, reqState]) =>
            tasks.push(
                asyncify(async () => {
                    const filepath = path.join(root, filename as string);
                    const isExists = await fileExists(filepath);
                    if (isExists !== (reqState as boolean)) {
                        throw new Error('Aborted');
                    }
                }),
            ),
        );

        Object.entries(fileDeps).forEach(([filename, reqContentHash]) =>
            tasks.push(
                asyncify(async () => {
                    const filepath = path.join(root, filename);
                    const isExists = await fileExists(filepath);
                    if (!isExists) {
                        throw new Error('Aborted');
                    }
                    const contentHash = await CacheService.getFileHashAsync(filepath);
                    if (contentHash !== reqContentHash) {
                        throw new Error('Aborted');
                    }
                }),
            ),
        );

        try {
            await parallelLimit(tasks, CUNCURRENCY);
        } catch (err) {
            if ((err as Error).message === 'Aborted') {
                return false;
            }
            throw err;
        }

        return true;
    }

    addFileDep({filename, content}: {filename: string; content: string | Uint8Array}) {
        if (this.data.fileDeps[filename]) return;

        this.data.fileDeps[filename] = CacheService.getHash(content);
    }

    addFileExists({filename, state}: {filename: string; state: boolean}) {
        this.data.existsFiles[filename] = state;
    }

    addCopyFile({from, to}: {from: string; to: string}) {
        this.data.copiedFiles[to] = from;
    }

    addFileVarsDep(filename: string, varsHashList: string[]) {
        this.data.fileVarsDeps[filename] = varsHashList;
    }

    addWriteFile(to: string, content: string | Uint8Array) {
        const contentHash = CacheService.getHash(content);

        this.wroteFileData[contentHash] = content;
        this.data.wroteFiles[to] = contentHash;
    }

    getResult<T>() {
        return this.data.result as T;
    }

    setResult(result: unknown) {
        this.data.result = result;
    }

    async extractCacheAsync() {
        await Promise.all([this.writeDataAsync(), this.copyFilesAsync()]);
    }

    extractCache() {
        this.writeData();
        this.copyFiles();
    }

    writeAssets() {
        const {wroteFileData} = this;
        for (const filename in wroteFileData) {
            if (!Object.hasOwnProperty.call(wroteFileData, filename)) {
                continue;
            }

            const data = wroteFileData[filename];
            const fullFilename = this.getAssetFilepath(filename);
            const place = path.dirname(fullFilename);
            if (!existsDir.has(place)) {
                fs.mkdirSync(place, {recursive: true});
            }
            fs.writeFileSync(fullFilename, data);
        }
    }

    async writeAssetsAsync() {
        const {wroteFileData} = this;

        const tasks = Object.entries(wroteFileData).map(([filename, data]) =>
            asyncify(async () => {
                const fullFilename = this.getAssetFilepath(filename);
                const place = path.dirname(fullFilename);
                if (!existsDir.has(place)) {
                    await fs.promises.mkdir(place, {recursive: true});
                }
                await fs.promises.writeFile(fullFilename, data);
            }),
        );

        await parallelLimit(tasks, CUNCURRENCY);
    }

    private writeData() {
        const {output} = ArgvService.getConfig();
        const distRoot = path.resolve(output);

        const {wroteFiles} = this.data;

        Object.entries(wroteFiles).forEach(([to, assetName]) => {
            const fullFrom = this.getAssetFilepath(assetName);
            const fullTo = path.join(distRoot, to);

            fs.mkdirSync(path.dirname(fullTo), {recursive: true});
            fs.copyFileSync(fullFrom, fullTo);
        });
    }

    private async writeDataAsync() {
        const {output} = ArgvService.getConfig();
        const distRoot = path.resolve(output);

        const {wroteFiles} = this.data;

        await mapLimit(
            Object.entries(wroteFiles),
            CUNCURRENCY,
            asyncify(async ([to, assetName]: string[]) => {
                const fullFrom = this.getAssetFilepath(assetName);
                const fullTo = path.join(distRoot, to);

                await fs.promises.mkdir(path.dirname(fullTo), {recursive: true});
                await fs.promises.copyFile(fullFrom, fullTo);
            }),
        );
    }

    private copyFiles() {
        const {input, output} = ArgvService.getConfig();
        const root = path.resolve(input);
        const distRoot = path.resolve(output);

        const {copiedFiles} = this.data;

        Object.entries(copiedFiles).forEach(([to, from]) => {
            const fullFrom = path.join(root, from);
            const fullTo = path.join(distRoot, to);

            fs.mkdirSync(path.dirname(fullTo), {recursive: true});
            fs.copyFileSync(fullFrom, fullTo);
        });
    }

    private async copyFilesAsync() {
        const {input, output} = ArgvService.getConfig();
        const root = path.resolve(input);
        const distRoot = path.resolve(output);

        const {copiedFiles} = this.data;

        await mapLimit(
            Object.entries(copiedFiles),
            CUNCURRENCY,
            asyncify(async ([to, from]: string[]) => {
                const fullFrom = path.join(root, from);
                const fullTo = path.join(distRoot, to);

                await fs.promises.mkdir(path.dirname(fullTo), {recursive: true});
                await fs.promises.copyFile(fullFrom, fullTo);
            }),
        );
    }

    private getAssetFilepath(key: string) {
        return path.join(this.assetsDir, key.slice(0, 2), key);
    }
}

export default CacheFile;
