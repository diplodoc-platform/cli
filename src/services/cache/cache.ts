import * as fs from 'fs';
import * as crypto from 'crypto';
import CacheFile from './cacheFile';
import {ArgvService} from '../index';
import {pick} from 'lodash';
import path from 'path';
import {fileExists} from '../../utils';
import {HashKey} from './types';

const objHash = new WeakMap<Object, string>();
const fileHash = new Map<string, string>();
const existsDir = new Set<string>();

type GetHashKeyProps = Omit<HashKey, 'key' | 'contentHash'> & {content: string};

let argsHash = '';

export class CacheService {
    static getObjHash(obj: Record<string, unknown>) {
        let hash = objHash.get(obj);
        if (!hash) {
            hash = this.getHash(JSON.stringify(obj));
            objHash.set(obj, hash);
        }
        return hash;
    }

    static getHash(data: crypto.BinaryLike) {
        return crypto.createHash('sha1').update(data).digest('hex');
    }

    static getFileHash(filename: string) {
        let hash = fileHash.get(filename);
        if (!hash) {
            hash = this.getHash(fs.readFileSync(filename));
            fileHash.set(filename, hash);
        }
        return hash;
    }

    static async getFileHashAsync(filename: string) {
        let hash = fileHash.get(filename);
        if (!hash) {
            hash = this.getHash(await fs.promises.readFile(filename));
            fileHash.set(filename, hash);
        }
        return hash;
    }

    static getHashKey({filename, content, varsHashList}: GetHashKeyProps): HashKey {
        if (!argsHash) {
            const args = ArgvService.getConfig();
            const staticArgs = pick(args, [
                'varsPreset',
                'ignore',
                'outputFormat',
                'allowHTML',
                'vars',
                'applyPresets',
                'resolveConditions',
                'conditionsInCode',
                'disableLiquid',
                'strict',
                'ignoreStage',
                'singlePage',
                'removeHiddenTocItems',
                'connector',
                'lang',
                'lintConfig',
                'resources',
                'addSystemMeta',
                'contributors',
                'ignoreAuthorPatterns',
                'allowCustomResources',
            ]);
            argsHash = CacheService.getHash(JSON.stringify(staticArgs));
        }
        const contentHash = CacheService.getHash(content);
        return {
            key: this.getHash(JSON.stringify({filename, contentHash, varsHashList, argsHash})),
            filename,
            contentHash,
            varsHashList,
        };
    }

    private readonly storeName;
    private cacheDir = '';
    private disabled = false;

    constructor(storeName = 'main') {
        this.storeName = storeName;
    }

    init(enabled: boolean, cacheDir: string) {
        this.disabled = !enabled;
        this.cacheDir = path.resolve(cacheDir);
    }

    checkFile({key}: HashKey) {
        if (this.disabled) {
            return;
        }

        const filepath = this.getCacheFilepath(key);
        if (!fs.existsSync(filepath)) {
            return;
        }
        let file: CacheFile;
        try {
            const dataJson = fs.readFileSync(filepath, 'utf-8');
            const data = JSON.parse(dataJson);
            file = CacheFile.from(data, this.disabled, this.getAssetsDir());
        } catch (err) {
            return;
        }
        return file?.check() ? file : undefined;
    }

    async checkFileAsync({key}: HashKey) {
        if (this.disabled) {
            return;
        }

        const filepath = this.getCacheFilepath(key);
        const exists = await fileExists(filepath);
        if (!exists) {
            return;
        }
        let file: CacheFile;
        try {
            const dataJson = await fs.promises.readFile(filepath, 'utf-8');
            const data = JSON.parse(dataJson);
            file = CacheFile.from(data, this.disabled, this.getAssetsDir());
        } catch (err) {
            return;
        }
        const isCorrect = await file?.checkAsync();
        return isCorrect ? file : undefined;
    }

    createFile(key: HashKey) {
        return new CacheFile(key, this.disabled, this.getAssetsDir());
    }

    addFile(file: CacheFile) {
        if (this.disabled) {
            return;
        }

        const filepath = this.getCacheFilepath(file.getKey());
        const place = path.dirname(filepath);
        if (!existsDir.has(place)) {
            fs.mkdirSync(place, {recursive: true});
            existsDir.add(place);
        }
        file.writeAssets();
        fs.writeFileSync(filepath, JSON.stringify(file.toJSON()));
    }

    async addFileAsync(file: CacheFile) {
        if (this.disabled) {
            return;
        }

        const filepath = this.getCacheFilepath(file.getKey());
        const place = path.dirname(filepath);
        if (!existsDir.has(place)) {
            await fs.promises.mkdir(place, {recursive: true});
            existsDir.add(place);
        }
        await Promise.all([
            file.writeAssetsAsync(),
            fs.promises.writeFile(filepath, JSON.stringify(file.toJSON())),
        ]);
    }

    getHashKey(props: GetHashKeyProps) {
        if (this.disabled) {
            const {filename, varsHashList} = props;
            return {
                key: '',
                contentHash: '',
                filename,
                varsHashList,
            };
        }

        return CacheService.getHashKey(props);
    }

    private getCacheFilepath(key: string) {
        return path.join(this.cacheDir, this.storeName, key.slice(0, 2), key);
    }

    private getAssetsDir() {
        return path.join(this.cacheDir, 'assets');
    }
}

export const cacheServiceLint = new CacheService('lint');
export const cacheServiceBuildMd = new CacheService('build-md');
export const cacheServiceMdToHtml = new CacheService('md-to-html');
