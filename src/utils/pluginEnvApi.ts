import * as fs from 'fs';
import * as path from 'path';
import CacheFile from '../services/cache/cacheFile';
import {getVarsPerFileWithHash} from './presets';
import {safeRelativePath} from './path';
import {asyncify, mapLimit} from 'async';

const CUNCURRENCY = 1000;

enum AsyncActionType {
    Copy = 'copy',
    Write = 'write',
}

type CopyFileAsyncAction = {type: AsyncActionType.Copy; from: string; to: string};
type WriteFileAsyncAction = {type: AsyncActionType.Write; to: string; data: string | Uint8Array};

type AsyncAction = CopyFileAsyncAction | WriteFileAsyncAction;

interface PluginEnvApiProps {
    root: string; distRoot: string; cacheFile?: CacheFile;
}

class PluginEnvApi {
    static create(props: PluginEnvApiProps) {
        return new PluginEnvApi(props);
    }

    public readonly root: string;
    public readonly distRoot: string;
    public readonly cacheFile: CacheFile | undefined;

    private readonly asyncActionQueue: AsyncAction[] = [];

    constructor({root, distRoot, cacheFile}: PluginEnvApiProps) {
        this.root = root;
        this.distRoot = distRoot;
        this.cacheFile = cacheFile?.use();
    }

    copyFile(rawFrom: string, rawTo: string) {
        const from = safeRelativePath(rawFrom);
        const to = safeRelativePath(rawTo);

        const fullFrom = path.join(this.root, from);
        const fullTo = path.join(this.distRoot, to);

        fs.mkdirSync(path.dirname(fullTo), {recursive: true});
        fs.copyFileSync(fullFrom, fullTo);
        if (this.cacheFile) {
            this.cacheFile.addCopyFile({from, to});
        }
    }

    copyFileAsync(rawFrom: string, rawTo: string) {
        const from = safeRelativePath(rawFrom);
        const to = safeRelativePath(rawTo);

        this.asyncActionQueue.push({type: AsyncActionType.Copy, from, to});
    }

    readFile(rawTarget: string, encoding: BufferEncoding | null): Uint8Array | string {
        const target = safeRelativePath(rawTarget);
        const fullTarget = path.join(this.root, target);

        const result = fs.readFileSync(fullTarget, encoding);
        if (this.cacheFile) {
            this.cacheFile.addFileDep({filename: target, content: result});
        }
        return result;
    }

    fileExists(rawTarget: string) {
        const target = safeRelativePath(rawTarget);
        const fullTarget = path.join(this.root, target);

        const result = fs.existsSync(fullTarget);
        if (this.cacheFile) {
            this.cacheFile.addFileExists({filename: target, state: result});
        }
        return result;
    }

    writeFile(rawTo: string, data: string | Uint8Array) {
        const to = safeRelativePath(rawTo);
        const fullTo = path.join(this.distRoot, to);

        fs.mkdirSync(path.dirname(fullTo), {recursive: true});
        fs.writeFileSync(fullTo, data);
        if (this.cacheFile) {
            this.cacheFile.addWriteFile(to, data);
        }
    }

    writeFileAsync(rawTo: string, data: string | Uint8Array) {
        const to = safeRelativePath(rawTo);

        this.asyncActionQueue.push({type: AsyncActionType.Write, to, data});
    }

    getFileVars(rawTarget: string) {
        const target = safeRelativePath(rawTarget);

        const {vars, varsHashList} = getVarsPerFileWithHash(target);
        if (this.cacheFile) {
            this.cacheFile.addFileVarsDep(target, varsHashList);
        }
        return vars;
    }

    executeActions() {
        const {asyncActionQueue} = this;

        asyncActionQueue.splice(0).forEach((action) => {
            switch (action.type) {
                case AsyncActionType.Copy: {
                    const {from, to} = action;
                    const fullFrom = path.join(this.root, from);
                    const fullTo = path.join(this.distRoot, to);

                    fs.mkdirSync(path.dirname(fullTo), {recursive: true});
                    fs.copyFileSync(fullFrom, fullTo);
                    if (this.cacheFile) {
                        this.cacheFile.addCopyFile({from, to});
                    }
                    break;
                }
                case AsyncActionType.Write: {
                    const {to, data} = action;
                    const fullTo = path.join(this.distRoot, to);

                    fs.mkdirSync(path.dirname(fullTo), {recursive: true});
                    fs.writeFileSync(fullTo, data);
                    if (this.cacheFile) {
                        this.cacheFile.addWriteFile(to, data);
                    }
                    break;
                }
            }
        });
    }

    async executeActionsAsync() {
        const {asyncActionQueue} = this;

        await mapLimit(asyncActionQueue.splice(0), CUNCURRENCY, asyncify(async (action: AsyncAction) => {
            switch (action.type) {
                case AsyncActionType.Copy: {
                    const {from, to} = action;
                    const fullFrom = path.join(this.root, from);
                    const fullTo = path.join(this.distRoot, to);

                    await fs.promises.mkdir(path.dirname(fullTo), {recursive: true});
                    await fs.promises.copyFile(fullFrom, fullTo);
                    if (this.cacheFile) {
                        this.cacheFile.addCopyFile({from, to});
                    }
                    break;
                }
                case AsyncActionType.Write: {
                    const {to, data} = action;
                    const fullTo = path.join(this.distRoot, to);

                    await fs.promises.mkdir(path.dirname(fullTo), {recursive: true});
                    await fs.promises.writeFile(fullTo, data);
                    if (this.cacheFile) {
                        this.cacheFile.addWriteFile(to, data);
                    }
                    break;
                }
            }
        }));
    }
}

export default PluginEnvApi;
